import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/whatsapp/route";
import { perguntarAoCopiloto } from "@/lib/agente/copiloto";
import { enviarMensagemWhatsApp } from "@/lib/whatsapp/evolution";

const TOKEN_WEBHOOK = "token_de_teste_do_whatsapp";
const NUMERO_ADRIANA = "11 98124-6464";

// Fake em memória das tabelas usadas pelo fluxo.
const { tabelas, criarSupabaseFalso } = vi.hoisted(() => {
  const tabelas = {
    eventos_brutos: [] as Array<Record<string, unknown>>,
    eventos_processados: new Map<string, Record<string, unknown>>(),
  };

  function criarSupabaseFalso() {
    return {
      from: (tabela: string) => {
        if (tabela === "eventos_processados") {
          return {
            select: () => {
              const filtros: Record<string, string> = {};
              const consulta = {
                eq: (coluna: string, valor: string) => {
                  filtros[coluna] = valor;
                  return consulta;
                },
                maybeSingle: () => {
                  const linha = tabelas.eventos_processados.get(
                    `${filtros["origem"]}:${filtros["evento_id_externo"]}`
                  );
                  return Promise.resolve({ data: linha ?? null, error: null });
                },
              };
              return consulta;
            },
            insert: (registro: { origem: string; evento_id_externo: string }) => {
              const id = `${registro.origem}:${registro.evento_id_externo}`;
              if (tabelas.eventos_processados.has(id)) {
                return Promise.resolve({ error: { message: "duplicate key" } });
              }
              tabelas.eventos_processados.set(id, { ...registro });
              return Promise.resolve({ error: null });
            },
          };
        }
        if (tabela === "eventos_brutos") {
          return {
            insert: (registro: Record<string, unknown>) => {
              tabelas.eventos_brutos.push({ ...registro });
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`Tabela inesperada no teste: ${tabela}`);
      },
    };
  }

  return { tabelas, criarSupabaseFalso };
});

vi.mock("@/lib/db/supabase", () => ({ obterSupabase: criarSupabaseFalso }));
vi.mock("@/lib/agente/copiloto", () => ({ perguntarAoCopiloto: vi.fn() }));
vi.mock("@/lib/whatsapp/evolution", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/whatsapp/evolution")>();
  return { ...original, enviarMensagemWhatsApp: vi.fn() };
});

// Payload no formato real do messages.upsert da Evolution API.
function mensagemDaAdriana(texto = "Como está a Beatriz?", id = "MSG_ID_001") {
  return {
    event: "messages.upsert",
    instance: "dnaccarato",
    data: {
      key: {
        id,
        remoteJid: "5511981246464@s.whatsapp.net",
        fromMe: false,
      },
      pushName: "Adriana",
      message: { conversation: texto },
      messageTimestamp: 1784750000,
    },
  };
}

function requisicao(payload: unknown, token: string | null = TOKEN_WEBHOOK): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) {
    headers["x-evolution-token"] = token;
  }
  return new Request("http://localhost/api/webhooks/whatsapp", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", TOKEN_WEBHOOK);
  vi.stubEnv("ADRIANA_WHATSAPP", NUMERO_ADRIANA);
  tabelas.eventos_brutos.length = 0;
  tabelas.eventos_processados.clear();
  vi.mocked(perguntarAoCopiloto)
    .mockReset()
    .mockResolvedValue("A Beatriz está com R$ 1.200,00 em atraso desde 12/07.");
  vi.mocked(enviarMensagemWhatsApp).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/whatsapp — mensagem da Adriana", () => {
  it("manda o texto pro agente e responde na mesma conversa", async () => {
    const resposta = await POST(requisicao(mensagemDaAdriana()));

    expect(resposta.status).toBe(200);
    expect(vi.mocked(perguntarAoCopiloto)).toHaveBeenCalledWith("Como está a Beatriz?");
    expect(vi.mocked(enviarMensagemWhatsApp)).toHaveBeenCalledWith(
      "5511981246464",
      "A Beatriz está com R$ 1.200,00 em atraso desde 12/07."
    );
    expect(tabelas.eventos_brutos).toHaveLength(1);
    expect(tabelas.eventos_processados.size).toBe(1);
  });

  it("mensagem no formato extendedTextMessage também funciona", async () => {
    const payload = mensagemDaAdriana();
    payload.data.message = {
      extendedTextMessage: { text: "Quem tem documento pendente?" },
    } as never;

    await POST(requisicao(payload));

    expect(vi.mocked(perguntarAoCopiloto)).toHaveBeenCalledWith("Quem tem documento pendente?");
  });

  it("mesma mensagem entregue duas vezes: 200 nas duas, agente roda uma vez", async () => {
    const primeira = await POST(requisicao(mensagemDaAdriana()));
    const segunda = await POST(requisicao(mensagemDaAdriana()));

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(vi.mocked(perguntarAoCopiloto)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enviarMensagemWhatsApp)).toHaveBeenCalledTimes(1);
  });

  it("falha do agente responde 500 e NÃO marca como processada (reentrega reprocessa)", async () => {
    vi.mocked(perguntarAoCopiloto).mockRejectedValue(new Error("API indisponível"));

    const resposta = await POST(requisicao(mensagemDaAdriana()));

    expect(resposta.status).toBe(500);
    expect(vi.mocked(enviarMensagemWhatsApp)).not.toHaveBeenCalled();
    expect(tabelas.eventos_processados.size).toBe(0);
  });
});

describe("POST /api/webhooks/whatsapp — mensagens ignoradas", () => {
  it("eco das nossas próprias mensagens (fromMe) não dispara o agente", async () => {
    const payload = mensagemDaAdriana();
    payload.data.key.fromMe = true;

    const resposta = await POST(requisicao(payload));

    expect(resposta.status).toBe(200);
    expect(vi.mocked(perguntarAoCopiloto)).not.toHaveBeenCalled();
  });

  it("mensagem de outro número não dispara o agente", async () => {
    const payload = mensagemDaAdriana();
    payload.data.key.remoteJid = "5511999990000@s.whatsapp.net";

    const resposta = await POST(requisicao(payload));

    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as { resumo: string };
    expect(corpo.resumo).toContain("outro número");
    expect(vi.mocked(perguntarAoCopiloto)).not.toHaveBeenCalled();
  });

  it("mensagem sem texto (mídia) é ignorada", async () => {
    const payload = mensagemDaAdriana();
    payload.data.message = {} as never;

    const resposta = await POST(requisicao(payload));

    expect(resposta.status).toBe(200);
    expect(vi.mocked(perguntarAoCopiloto)).not.toHaveBeenCalled();
  });

  it("evento que não é messages.upsert é ignorado", async () => {
    const resposta = await POST(requisicao({ event: "connection.update", instance: "dnaccarato" }));

    expect(resposta.status).toBe(200);
    expect(vi.mocked(perguntarAoCopiloto)).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/whatsapp — validação", () => {
  it("token errado responde 401 sem tocar em nada", async () => {
    const resposta = await POST(requisicao(mensagemDaAdriana(), "token_errado"));
    expect(resposta.status).toBe(401);
    expect(tabelas.eventos_brutos).toHaveLength(0);
  });

  it("sem token responde 401", async () => {
    expect((await POST(requisicao(mensagemDaAdriana(), null))).status).toBe(401);
  });

  it("payload sem event responde 400", async () => {
    const resposta = await POST(requisicao({ instance: "dnaccarato" }));
    expect(resposta.status).toBe(400);
  });
});
