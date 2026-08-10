import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Integração do servidor MCP fim-a-fim: request → auth (contra api_tokens) →
 * dispatch → tool (lógica real) → Supabase (stub) + serviços externos (mock) →
 * auditoria (registrarAuditoria REAL, gravando no stub de log_auditoria).
 *
 * Cobre: autenticação (aceita/recusa), cada tool de leitura com dado do "seed",
 * e cada tool de escrita com efeito colateral + log de auditoria.
 */

interface RQ {
  data: unknown;
  error: { message: string } | null;
}

const h = vi.hoisted(() => ({
  // Valor por tabela: RQ (repetido) ou RQ[] (fila, consumida a cada terminal).
  porTabela: {} as Record<string, RQ | RQ[]>,
  // Inserts registrados por tabela (para verificar efeito colateral e auditoria).
  inseridos: {} as Record<string, unknown[]>,
  enviarTexto: vi.fn((_e: { numero: string; texto: string }) =>
    Promise.resolve({ ok: true, status: 200, corpo: {} }),
  ),
  criarTask: vi.fn(() => Promise.resolve({ gid: "task-999" })),
  cancelarEvento: vi.fn(() => Promise.resolve()),
  buscarEmails: vi.fn(() =>
    Promise.resolve([
      { id: "m1", assunto: "Re: Contrato", trecho: "...", data: "2026-08-01" },
    ]),
  ),
}));

vi.mock("@/lib/db/client", () => {
  const terminal = (tabela: string): RQ => {
    const v = h.porTabela[tabela];
    if (Array.isArray(v)) return v.shift() ?? { data: null, error: null };
    return v ?? { data: null, error: null };
  };
  const make = (tabela: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      or: () => q,
      ilike: () => q,
      in: () => q,
      limit: () => q,
      update: () => q,
      insert: (row: unknown) => {
        (h.inseridos[tabela] ??= []).push(row);
        return q;
      },
      maybeSingle: () => Promise.resolve(terminal(tabela)),
      then: (aoResolver: (v: RQ) => unknown) =>
        Promise.resolve(terminal(tabela)).then(aoResolver),
    };
    return q;
  };
  return { getServiceClient: () => ({ from: (t: string) => make(t) }) };
});
vi.mock("@/lib/whatsapp/client", () => ({ enviarTexto: h.enviarTexto }));
vi.mock("@/lib/integrations/asana", () => ({ criarTask: h.criarTask }));
vi.mock("@/lib/integrations/calendly", () => ({ cancelarEvento: h.cancelarEvento }));
vi.mock("@/lib/integrations/gmail", () => ({ buscarEmails: h.buscarEmails }));

import { POST } from "@/app/api/mcp/route";

const UUID = "11111111-1111-1111-1111-111111111111";
const TODAS = [
  "buscar_aluna",
  "status_aluna",
  "dossie_aluna",
  "detectar_furos",
  "pagamentos_pendentes",
  "documentos_nao_assinados",
  "proxima_reuniao",
  "buscar_formulario",
  "buscar_email",
  "enviar_lembrete_pagamento",
  "criar_task_asana",
  "remarcar_reuniao",
];

function tokenComEscopo(
  escopo: string[],
  extra: Partial<{ status: string; expira_em: string | null }> = {},
): void {
  h.porTabela.api_tokens = {
    data: { id: "tok-1", escopo, status: "ativo", expira_em: null, ...extra },
    error: null,
  };
  h.porTabela.log_auditoria = { data: null, error: null };
}

function requisicao(body: unknown, token?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function chamarTool(name: string, args: unknown): Promise<Response> {
  return POST(
    requisicao(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
      "token-cru",
    ),
  );
}

const conteudo = async (res: Response) =>
  JSON.parse((await res.json()).result.content[0].text);
const erro = async (res: Response) => (await res.json()).error;
const auditoria = () => (h.inseridos.log_auditoria ?? []) as Record<string, unknown>[];

// Linha embutida (dossiê/furos) de uma aluna com dados do "seed".
function alunaEmbutida(over: Partial<Record<string, unknown>> = {}): RQ {
  return {
    data: {
      id: UUID,
      nome: "Ana Prado",
      email: "ana@ex.com",
      telefone: "11999998888",
      criado_em: "2026-01-01T00:00:00Z",
      metadata: {},
      pagamentos: [],
      documentos: [],
      materiais: [],
      formularios: [],
      reunioes: [],
      tasks_asana: [],
      ...over,
    },
    error: null,
  };
}

beforeEach(() => {
  h.porTabela = {};
  h.inseridos = {};
  vi.clearAllMocks();
  process.env.ASANA_WORKSPACE_ID = "ws-1";
});

describe("MCP — autenticação", () => {
  it("aceita token válido e no escopo", async () => {
    tokenComEscopo(["pagamentos_pendentes"]);
    h.porTabela.pagamentos = { data: [], error: null };
    const res = await chamarTool("pagamentos_pendentes", {});
    expect(res.status).toBe(200);
  });

  it("recusa sem token (401)", async () => {
    const res = await POST(requisicao({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(res.status).toBe(401);
  });

  it("recusa token inexistente (401)", async () => {
    h.porTabela.api_tokens = { data: null, error: null };
    const res = await POST(
      requisicao({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "x"),
    );
    expect(res.status).toBe(401);
  });

  it("recusa token revogado (401)", async () => {
    tokenComEscopo(["pagamentos_pendentes"], { status: "revogado" });
    const res = await POST(
      requisicao({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "x"),
    );
    expect(res.status).toBe(401);
  });

  it("recusa token expirado (401)", async () => {
    tokenComEscopo(["pagamentos_pendentes"], { expira_em: "2020-01-01T00:00:00Z" });
    const res = await POST(
      requisicao({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "x"),
    );
    expect(res.status).toBe(401);
  });

  it("recusa tool fora do escopo (erro, sem vazar)", async () => {
    tokenComEscopo(["pagamentos_pendentes"]);
    const res = await chamarTool("criar_task_asana", { aluna_id: UUID, titulo: "x" });
    expect((await erro(res)).code).toBe(-32001);
    expect(h.criarTask).not.toHaveBeenCalled();
  });
});

describe("MCP — tools de leitura (dado do seed)", () => {
  beforeEach(() => tokenComEscopo(TODAS));

  it("buscar_aluna", async () => {
    h.porTabela.alunas = {
      data: [
        { id: UUID, nome: "Ana Prado", email: "ana@ex.com", telefone: "11999998888" },
      ],
      error: null,
    };
    expect(
      (await conteudo(await chamarTool("buscar_aluna", { termo: "ana" }))).alunas,
    ).toHaveLength(1);
  });

  it("status_aluna", async () => {
    h.porTabela.alunas = [
      {
        data: [{ id: UUID, nome: "Ana Prado", email: "ana@ex.com", telefone: null }],
        error: null,
      },
      alunaEmbutida({
        pagamentos: [
          {
            id: "p1",
            origem: "asaas",
            status: "pago",
            valor: 500,
            vencimento: null,
            pago_em: null,
            referencia_externa: "r",
          },
        ],
      }),
    ];
    const c = await conteudo(await chamarTool("status_aluna", { nome: "Ana Prado" }));
    expect(c.aluna).toMatchObject({ id: UUID, nome: "Ana Prado" });
    expect(c.pagamentos.resumo.total).toBe(1);
  });

  it("dossie_aluna", async () => {
    h.porTabela.alunas = alunaEmbutida();
    const c = await conteudo(await chamarTool("dossie_aluna", { aluna_id: UUID }));
    expect(c.aluna.id).toBe(UUID);
  });

  it("detectar_furos (Fernanda: assinatura rejeitada)", async () => {
    h.porTabela.alunas = alunaEmbutida({
      nome: "Fernanda Alves",
      documentos: [
        { status: "rejeitado", tipo: "contrato", motivo_rejeicao: "Dados divergentes" },
      ],
    });
    const c = await conteudo(await chamarTool("detectar_furos", { aluna_id: UUID }));
    expect(c.furos[0].tipo).toBe("assinatura_rejeitada");
  });

  it("pagamentos_pendentes (Bruna atrasada)", async () => {
    h.porTabela.pagamentos = {
      data: [
        { aluna_id: "b", valor: 500, status: "atrasado", alunas: { nome: "Bruna Lima" } },
      ],
      error: null,
    };
    const c = await conteudo(await chamarTool("pagamentos_pendentes", {}));
    expect(c.pagamentos_atrasados).toHaveLength(1);
  });

  it("documentos_nao_assinados (pendente + rejeitado separados)", async () => {
    h.porTabela.documentos = {
      data: [
        { id: "d1", status: "pendente", tipo: "contrato", motivo_rejeicao: null },
        { id: "d2", status: "rejeitado", tipo: "contrato", motivo_rejeicao: "x" },
      ],
      error: null,
    };
    const c = await conteudo(await chamarTool("documentos_nao_assinados", {}));
    expect(c.pendentes).toHaveLength(1);
    expect(c.rejeitados).toHaveLength(1);
  });

  it("proxima_reuniao", async () => {
    h.porTabela.alunas = {
      data: [{ id: UUID, nome: "Ana Prado", email: null, telefone: null }],
      error: null,
    };
    h.porTabela.reunioes = {
      data: [
        {
          id: "r2",
          status: "agendada",
          data_hora: "2099-01-01T10:00:00Z",
          origem: "calendly",
          link: "z",
        },
      ],
      error: null,
    };
    const c = await conteudo(await chamarTool("proxima_reuniao", { nome: "Ana Prado" }));
    expect(c.proxima_reuniao.id).toBe("r2");
  });

  it("buscar_formulario", async () => {
    h.porTabela.formularios = {
      data: [
        {
          id: "f1",
          formulario_nome: "Onboarding",
          respondido_em: "2026-08-01T00:00:00Z",
        },
      ],
      error: null,
    };
    expect(
      (await conteudo(await chamarTool("buscar_formulario", { query: "onboard" })))
        .formularios,
    ).toHaveLength(1);
  });

  it("buscar_email (Gmail)", async () => {
    h.porTabela.alunas = {
      data: { id: UUID, nome: "Ana Prado", email: "ana@ex.com" },
      error: null,
    };
    const c = await conteudo(
      await chamarTool("buscar_email", { aluna_id: UUID, query: "contrato" }),
    );
    expect(c.emails[0]).toMatchObject({ assunto: "Re: Contrato" });
  });
});

describe("MCP — tools de escrita (efeito colateral + auditoria)", () => {
  beforeEach(() => tokenComEscopo(TODAS));

  it("enviar_lembrete_pagamento: envia WhatsApp e audita", async () => {
    h.porTabela.alunas = {
      data: { id: UUID, nome: "Ana Prado", telefone: "11999998888" },
      error: null,
    };

    const c = await conteudo(
      await chamarTool("enviar_lembrete_pagamento", { aluna_id: UUID }),
    );
    expect(c.enviado).toBe(true);
    // efeito colateral
    expect(h.enviarTexto).toHaveBeenCalledTimes(1);
    // auditoria (quem/o quê/resultado) gravada de verdade
    expect(auditoria()).toHaveLength(1);
    expect(auditoria()[0]).toMatchObject({
      origem: "mcp",
      acao: "enviar_lembrete_pagamento",
      aluna_id: UUID,
      resultado: "sucesso",
    });
    expect((auditoria()[0]?.detalhes as Record<string, unknown>).token_id).toBe("tok-1");
  });

  it("criar_task_asana: cria no Asana, vincula em tasks_asana e audita", async () => {
    h.porTabela.alunas = { data: { id: UUID, nome: "Ana Prado" }, error: null };

    const c = await conteudo(
      await chamarTool("criar_task_asana", { aluna_id: UUID, titulo: "Ligar" }),
    );
    expect(c.task_id).toBe("task-999");
    // efeito colateral: chamou o Asana e gravou o vínculo
    expect(h.criarTask).toHaveBeenCalledTimes(1);
    expect(h.inseridos.tasks_asana?.[0]).toMatchObject({
      aluna_id: UUID,
      task_id: "task-999",
    });
    // auditoria
    expect(auditoria()[0]).toMatchObject({
      acao: "criar_task_asana",
      resultado: "sucesso",
    });
    expect((auditoria()[0]?.detalhes as Record<string, unknown>).task_id).toBe(
      "task-999",
    );
  });

  it("remarcar_reuniao: cancela no Calendly e audita", async () => {
    h.porTabela.reunioes = {
      data: [
        {
          id: "r1",
          status: "agendada",
          referencia_externa:
            "https://api.calendly.com/scheduled_events/EVT-123/invitees/INV-9",
        },
      ],
      error: null,
    };
    const c = await conteudo(
      await chamarTool("remarcar_reuniao", {
        aluna_id: UUID,
        novo_horario: "2026-09-01T14:00:00Z",
      }),
    );
    expect(c.cancelada).toBe(true);
    expect(h.cancelarEvento).toHaveBeenCalledWith(
      "EVT-123",
      expect.stringContaining("2026-09-01"),
    );
    expect(auditoria()[0]).toMatchObject({
      acao: "remarcar_reuniao",
      resultado: "sucesso",
    });
  });

  it("erro de negócio (aluna sem telefone) é auditado como 'erro' e não dispara efeito", async () => {
    h.porTabela.alunas = { data: { id: UUID, nome: "Ana", telefone: null }, error: null };
    const res = await chamarTool("enviar_lembrete_pagamento", { aluna_id: UUID });
    expect((await erro(res)).code).toBe(-32004);
    expect(h.enviarTexto).not.toHaveBeenCalled();
    expect(auditoria()[0]).toMatchObject({
      acao: "enviar_lembrete_pagamento",
      resultado: "erro",
    });
  });
});
