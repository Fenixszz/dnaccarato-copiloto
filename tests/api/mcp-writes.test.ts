import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Testa as tools de ESCRITA do MCP e a auditoria (registrarAuditoria) de cada
 * chamada. Supabase, WhatsApp (Evolution), Asana e Calendly são mockados.
 */

interface RQ {
  data: unknown;
  error: { message: string } | null;
}

const h = vi.hoisted(() => ({
  porTabela: {} as Record<string, RQ>,
  enviarTexto: vi.fn((_envio: { numero: string; texto: string }) =>
    Promise.resolve({ ok: true, status: 200, corpo: {} }),
  ),
  criarTask: vi.fn(() => Promise.resolve({ gid: "task-999" })),
  cancelarEvento: vi.fn(() => Promise.resolve()),
  registrarAuditoria: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/db/client", () => {
  const make = (tabela: string) => {
    const res = (): RQ => h.porTabela[tabela] ?? { data: null, error: null };
    const q = {
      select: () => q,
      eq: () => q,
      or: () => q,
      ilike: () => q,
      in: () => q,
      limit: () => q,
      insert: () => q,
      update: () => q,
      maybeSingle: () => Promise.resolve(res()),
      then: (aoResolver: (v: RQ) => unknown) => Promise.resolve(res()).then(aoResolver),
    };
    return q;
  };
  return { getServiceClient: () => ({ from: (t: string) => make(t) }) };
});
vi.mock("@/lib/whatsapp/client", () => ({ enviarTexto: h.enviarTexto }));
vi.mock("@/lib/integrations/asana", () => ({ criarTask: h.criarTask }));
vi.mock("@/lib/integrations/calendly", () => ({ cancelarEvento: h.cancelarEvento }));
vi.mock("@/lib/db/queries", () => ({ registrarAuditoria: h.registrarAuditoria }));

import { POST } from "@/app/api/mcp/route";

const UUID = "11111111-1111-1111-1111-111111111111";
const ESCRITA = ["enviar_lembrete_pagamento", "criar_task_asana", "remarcar_reuniao"];

function chamar(name: string, args: unknown): Promise<Response> {
  h.porTabela.api_tokens = {
    data: { id: "tok-1", escopo: ESCRITA, status: "ativo", expira_em: null },
    error: null,
  };
  return POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer x" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
}

const conteudo = async (res: Response) =>
  JSON.parse((await res.json()).result.content[0].text);
const erro = async (res: Response) => (await res.json()).error;

beforeEach(() => {
  h.porTabela = {};
  vi.clearAllMocks();
  process.env.ASANA_WORKSPACE_ID = "ws-1";
});

describe("MCP tools de escrita", () => {
  it("enviar_lembrete_pagamento: envia via WhatsApp (rate limiter) e audita", async () => {
    h.porTabela.alunas = {
      data: { id: UUID, nome: "Ana Prado", telefone: "+55 11 99999-8888" },
      error: null,
    };
    const c = await conteudo(
      await chamar("enviar_lembrete_pagamento", { aluna_id: UUID }),
    );
    expect(c.enviado).toBe(true);
    expect(h.enviarTexto).toHaveBeenCalledTimes(1);
    expect(h.enviarTexto.mock.calls[0]?.[0]).toMatchObject({ numero: "5511999998888" });

    expect(h.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        origem: "mcp",
        acao: "enviar_lembrete_pagamento",
        resultado: "sucesso",
        detalhes: expect.objectContaining({ token_id: "tok-1", canal: "whatsapp" }),
      }),
    );
  });

  it("enviar_lembrete_pagamento: variação determinística por aluna", async () => {
    h.porTabela.alunas = {
      data: { id: UUID, nome: "Ana Prado", telefone: "11999998888" },
      error: null,
    };
    const a = await conteudo(
      await chamar("enviar_lembrete_pagamento", { aluna_id: UUID }),
    );
    const b = await conteudo(
      await chamar("enviar_lembrete_pagamento", { aluna_id: UUID }),
    );
    expect(a.texto).toBe(b.texto);
    expect(a.texto).toContain("Ana");
  });

  it("enviar_lembrete_pagamento: aluna sem telefone → mensagem clara, não envia", async () => {
    h.porTabela.alunas = { data: { id: UUID, nome: "Ana", telefone: null }, error: null };
    const e = await erro(await chamar("enviar_lembrete_pagamento", { aluna_id: UUID }));
    expect(e.code).toBe(-32004);
    expect(e.message).toMatch(/telefone/i);
    expect(h.enviarTexto).not.toHaveBeenCalled();
  });

  it("criar_task_asana: cria no Asana, vincula e audita com o task_id", async () => {
    h.porTabela.alunas = { data: { id: UUID, nome: "Ana Prado" }, error: null };
    h.porTabela.tasks_asana = { data: null, error: null };
    const c = await conteudo(
      await chamar("criar_task_asana", {
        aluna_id: UUID,
        titulo: "Ligar",
        descricao: "urgente",
      }),
    );
    expect(c.task_id).toBe("task-999");
    expect(h.criarTask).toHaveBeenCalledTimes(1);
    expect(h.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: "criar_task_asana",
        detalhes: expect.objectContaining({ task_id: "task-999", titulo: "Ligar" }),
      }),
    );
  });

  it("remarcar_reuniao: cancela o evento no Calendly e atualiza", async () => {
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
      await chamar("remarcar_reuniao", {
        aluna_id: UUID,
        novo_horario: "2026-09-01T14:00:00Z",
      }),
    );
    expect(c.cancelada).toBe(true);
    expect(h.cancelarEvento).toHaveBeenCalledWith(
      "EVT-123",
      expect.stringContaining("2026-09-01"),
    );
  });

  it("remarcar_reuniao: sem reunião agendada → mensagem clara", async () => {
    h.porTabela.reunioes = { data: [], error: null };
    const e = await erro(
      await chamar("remarcar_reuniao", {
        aluna_id: UUID,
        novo_horario: "2026-09-01T14:00:00Z",
      }),
    );
    expect(e.code).toBe(-32004);
    expect(h.cancelarEvento).not.toHaveBeenCalled();
  });

  it("remarcar_reuniao: novo_horario inválido → InvalidParams", async () => {
    const e = await erro(
      await chamar("remarcar_reuniao", { aluna_id: UUID, novo_horario: "amanhã" }),
    );
    expect(e.code).toBe(-32602);
  });
});
