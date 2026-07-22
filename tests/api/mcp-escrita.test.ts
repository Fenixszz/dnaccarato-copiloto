import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { cancelarAgendamentoCalendly } from "@/lib/integrations/calendly";
import { criarTaskAsana } from "@/lib/integrations/asana";
import { enviarMensagemWhatsApp } from "@/lib/whatsapp/evolution";

const TOKEN = "mcp_token_de_teste_escrita";
const TOKEN_HASH = createHash("sha256").update(TOKEN).digest("hex");
const ALUNA_ID = "3f1c4a68-9a1b-4f4e-8a2e-5b6c7d8e9f10";

// Fake em memória cobrindo autenticação, dados e as escritas auditadas.
const { estado, criarSupabaseFalso } = vi.hoisted(() => {
  const estado: {
    tokens: Map<string, Record<string, unknown>>;
    alunaData: Record<string, unknown> | null;
    pagamentos: Array<Record<string, unknown>>;
    reunioes: Array<Record<string, unknown>>;
    reunioesAtualizadas: Array<Record<string, unknown>>;
    reunioesInseridas: Array<Record<string, unknown>>;
    tasksInseridas: Array<Record<string, unknown>>;
    auditoria: Array<Record<string, unknown>>;
    falharAuditoria: boolean;
  } = {
    tokens: new Map(),
    alunaData: null,
    pagamentos: [],
    reunioes: [],
    reunioesAtualizadas: [],
    reunioesInseridas: [],
    tasksInseridas: [],
    auditoria: [],
    falharAuditoria: false,
  };

  function listaThenable(linhas: () => Array<Record<string, unknown>>) {
    const consulta = {
      eq: () => consulta,
      lt: () => consulta,
      gte: () => consulta,
      neq: () => consulta,
      order: () => consulta,
      limit: () => consulta,
      maybeSingle: () => Promise.resolve({ data: estado.alunaData, error: null }),
      then: (
        cumprir: (valor: { data: unknown; error: null }) => unknown,
        rejeitar?: (motivo: unknown) => unknown
      ) => Promise.resolve({ data: linhas(), error: null }).then(cumprir, rejeitar),
    };
    return consulta;
  }

  function criarSupabaseFalso() {
    return {
      from: (tabela: string) => {
        if (tabela === "api_tokens") {
          return {
            select: () => ({
              eq: (_coluna: string, hash: string) => ({
                maybeSingle: () =>
                  Promise.resolve({ data: estado.tokens.get(hash) ?? null, error: null }),
              }),
            }),
          };
        }
        if (tabela === "alunas") {
          return { select: () => listaThenable(() => []) };
        }
        if (tabela === "pagamentos") {
          return { select: () => listaThenable(() => estado.pagamentos) };
        }
        if (tabela === "reunioes") {
          return {
            select: () => listaThenable(() => estado.reunioes),
            update: (valores: Record<string, unknown>) => ({
              eq: (_coluna: string, id: string) => {
                estado.reunioesAtualizadas.push({ id, ...valores });
                return Promise.resolve({ error: null });
              },
            }),
            insert: (registro: Record<string, unknown>) => {
              estado.reunioesInseridas.push({ ...registro });
              return Promise.resolve({ error: null });
            },
          };
        }
        if (tabela === "tasks_asana") {
          return {
            insert: (registro: Record<string, unknown>) => {
              estado.tasksInseridas.push({ ...registro });
              return Promise.resolve({ error: null });
            },
          };
        }
        if (tabela === "log_auditoria") {
          return {
            insert: (registro: Record<string, unknown>) => {
              if (estado.falharAuditoria) {
                return Promise.resolve({ error: { message: "tabela indisponível" } });
              }
              estado.auditoria.push({ ...registro });
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`Tabela inesperada no teste: ${tabela}`);
      },
    };
  }

  return { estado, criarSupabaseFalso };
});

vi.mock("@/lib/db/supabase", () => ({ obterSupabase: criarSupabaseFalso }));
vi.mock("@/lib/whatsapp/evolution", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/whatsapp/evolution")>();
  return { ...original, enviarMensagemWhatsApp: vi.fn() };
});
vi.mock("@/lib/integrations/asana", () => ({ criarTaskAsana: vi.fn() }));
vi.mock("@/lib/integrations/calendly", () => ({ cancelarAgendamentoCalendly: vi.fn() }));

type RespostaTool = { result: { content: Array<{ text: string }>; isError?: boolean } };

async function chamarTool(nome: string, argumentos: Record<string, unknown>) {
  const resposta = await POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: nome, arguments: argumentos },
      }),
    })
  );
  const corpo = (await resposta.json()) as RespostaTool;
  return corpo.result;
}

beforeEach(() => {
  estado.tokens.clear();
  estado.tokens.set(TOKEN_HASH, {
    id: "token_escrita",
    nome: "token-de-escrita",
    escopo: ["enviar_lembrete_pagamento", "criar_task_asana", "remarcar_reuniao"],
    status: "ativo",
  });
  estado.alunaData = { id: ALUNA_ID, nome: "Beatriz Lima", telefone: "(11) 92222-0002" };
  estado.pagamentos = [{ status: "pendente", valor: 1200, vencimento: "2026-07-10" }];
  estado.reunioes = [];
  estado.reunioesAtualizadas = [];
  estado.reunioesInseridas = [];
  estado.tasksInseridas = [];
  estado.auditoria = [];
  estado.falharAuditoria = false;
  vi.mocked(enviarMensagemWhatsApp).mockReset().mockResolvedValue(undefined);
  vi.mocked(criarTaskAsana)
    .mockReset()
    .mockResolvedValue({ gid: "gid_task_1", url: "https://app.asana.com/t/gid_task_1" });
  vi.mocked(cancelarAgendamentoCalendly).mockReset().mockResolvedValue(undefined);
});

describe("enviar_lembrete_pagamento", () => {
  it("envia a mensagem e grava a auditoria com token e resultado", async () => {
    const resultado = await chamarTool("enviar_lembrete_pagamento", { aluna_id: ALUNA_ID });

    expect(resultado.isError).toBeUndefined();
    expect(vi.mocked(enviarMensagemWhatsApp)).toHaveBeenCalledWith(
      "5511922220002",
      expect.stringContaining("Oi, Beatriz!")
    );
    expect(estado.auditoria).toHaveLength(1);
    expect(estado.auditoria[0]).toMatchObject({
      origem: "mcp",
      acao: "enviar_lembrete_pagamento",
      aluna_id: ALUNA_ID,
      resultado: expect.stringContaining("lembrete enviado"),
      detalhes: expect.objectContaining({ token_nome: "token-de-escrita" }),
    });
  });

  it("aluna sem telefone: recusa com mensagem clara E audita a recusa", async () => {
    estado.alunaData = { id: ALUNA_ID, nome: "Beatriz Lima", telefone: null };

    const resultado = await chamarTool("enviar_lembrete_pagamento", { aluna_id: ALUNA_ID });

    expect(resultado.isError).toBe(true);
    expect(resultado.content[0].text).toContain("não tem telefone cadastrado");
    expect(vi.mocked(enviarMensagemWhatsApp)).not.toHaveBeenCalled();
    expect(estado.auditoria[0]).toMatchObject({
      resultado: "recusado: aluna sem telefone cadastrado",
    });
  });

  it("sem pagamento atrasado: recusa e audita, sem enviar nada", async () => {
    estado.pagamentos = [{ status: "CONFIRMED", valor: 1200, vencimento: "2026-07-10" }];

    const resultado = await chamarTool("enviar_lembrete_pagamento", { aluna_id: ALUNA_ID });

    expect(resultado.isError).toBe(true);
    expect(vi.mocked(enviarMensagemWhatsApp)).not.toHaveBeenCalled();
    expect(estado.auditoria[0]).toMatchObject({
      resultado: "recusado: nenhum pagamento atrasado",
    });
  });

  it("falha no envio: resposta genérica pro cliente, erro detalhado na auditoria", async () => {
    vi.mocked(enviarMensagemWhatsApp).mockRejectedValue(
      new Error("Evolution API retornou HTTP 500")
    );

    const resultado = await chamarTool("enviar_lembrete_pagamento", { aluna_id: ALUNA_ID });

    expect(resultado.isError).toBe(true);
    expect(resultado.content[0].text).toBe(
      "Erro interno ao executar a tool enviar_lembrete_pagamento"
    );
    expect(estado.auditoria[0].resultado).toContain("erro: Evolution API retornou HTTP 500");
  });

  it("se a auditoria falhar, a tool responde erro mesmo com a ação executada", async () => {
    estado.falharAuditoria = true;

    const resultado = await chamarTool("enviar_lembrete_pagamento", { aluna_id: ALUNA_ID });

    expect(resultado.isError).toBe(true);
    expect(resultado.content[0].text).toContain("não pôde registrar a auditoria");
  });

  it("aluna inexistente audita com aluna_id nulo (FK de log_auditoria)", async () => {
    estado.alunaData = null;

    const resultado = await chamarTool("enviar_lembrete_pagamento", { aluna_id: ALUNA_ID });

    expect(resultado.isError).toBe(true);
    expect(estado.auditoria[0]).toMatchObject({
      aluna_id: null,
      resultado: "recusado: aluna não encontrada",
    });
  });
});

describe("criar_task_asana", () => {
  it("cria no Asana, espelha em tasks_asana e audita", async () => {
    const resultado = await chamarTool("criar_task_asana", {
      aluna_id: ALUNA_ID,
      titulo: "Revisar plano alimentar",
      descricao: "Aluna pediu ajuste no café da manhã",
    });

    expect(resultado.isError).toBeUndefined();
    expect(vi.mocked(criarTaskAsana)).toHaveBeenCalledWith(
      "Revisar plano alimentar — Beatriz Lima",
      "Aluna pediu ajuste no café da manhã"
    );
    expect(estado.tasksInseridas).toEqual([
      expect.objectContaining({ aluna_id: ALUNA_ID, task_id: "gid_task_1", status: "aberta" }),
    ]);
    expect(estado.auditoria[0]).toMatchObject({
      acao: "criar_task_asana",
      resultado: "task gid_task_1 criada no Asana",
    });
  });
});

describe("remarcar_reuniao", () => {
  const URI_EVENTO = "https://api.calendly.com/scheduled_events/GBGBDCAADAEDCRZ2";

  it("cancela no Calendly, atualiza a antiga, insere a nova e audita", async () => {
    estado.reunioes = [
      { id: "reu_1", data_hora: "2026-07-25T13:00:00.000Z", referencia_externa: URI_EVENTO },
    ];

    const resultado = await chamarTool("remarcar_reuniao", {
      aluna_id: ALUNA_ID,
      novo_horario: "2026-07-30T14:00:00.000Z",
    });

    expect(resultado.isError).toBeUndefined();
    expect(vi.mocked(cancelarAgendamentoCalendly)).toHaveBeenCalledWith(
      URI_EVENTO,
      expect.stringContaining("Remarcada")
    );
    expect(estado.reunioesAtualizadas).toEqual([
      expect.objectContaining({ id: "reu_1", status: "cancelada" }),
    ]);
    expect(estado.reunioesInseridas).toEqual([
      expect.objectContaining({
        aluna_id: ALUNA_ID,
        origem: "manual",
        data_hora: "2026-07-30T14:00:00.000Z",
        status: "agendada",
      }),
    ]);
    const corpo = JSON.parse(resultado.content[0].text) as Record<string, unknown>;
    expect(corpo.aviso).toContain("não cria agendamento por API");
    expect(estado.auditoria[0]).toMatchObject({ acao: "remarcar_reuniao", aluna_id: ALUNA_ID });
  });

  it("sem reunião futura do Calendly: recusa clara, nada cancelado, auditado", async () => {
    estado.reunioes = [];

    const resultado = await chamarTool("remarcar_reuniao", {
      aluna_id: ALUNA_ID,
      novo_horario: "2026-07-30T14:00:00.000Z",
    });

    expect(resultado.isError).toBe(true);
    expect(resultado.content[0].text).toContain("não tem reunião futura do Calendly");
    expect(vi.mocked(cancelarAgendamentoCalendly)).not.toHaveBeenCalled();
    expect(estado.auditoria[0].resultado).toContain("recusado");
  });

  it("novo_horario inválido é rejeitado pela validação antes de executar", async () => {
    const resultado = await chamarTool("remarcar_reuniao", {
      aluna_id: ALUNA_ID,
      novo_horario: "amanhã de tarde",
    });

    expect(resultado.isError).toBe(true);
    expect(vi.mocked(cancelarAgendamentoCalendly)).not.toHaveBeenCalled();
    // Rejeição de input acontece antes do fluxo auditado começar.
    expect(estado.auditoria).toHaveLength(0);
  });
});
