import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/briefing/route";
import { enviarMensagemWhatsApp } from "@/lib/whatsapp/evolution";

const SEGREDO = "segredo_do_cron_de_teste";

// Fake em memória: alunas (coleta de furos, uma query com embeds) e
// briefings_enviados (dedupe diário com chave única).
const { estado, criarSupabaseFalso } = vi.hoisted(() => {
  const estado: {
    alunas: Array<Record<string, unknown>>;
    briefings: Map<string, Record<string, unknown>>;
  } = {
    alunas: [],
    briefings: new Map(),
  };

  function criarSupabaseFalso() {
    return {
      from: (tabela: string) => {
        if (tabela === "alunas") {
          return {
            select: () => ({
              order: () => Promise.resolve({ data: estado.alunas, error: null }),
            }),
          };
        }
        if (tabela === "briefings_enviados") {
          return {
            select: () => ({
              eq: (_coluna: string, chave: string) => ({
                maybeSingle: () =>
                  Promise.resolve({ data: estado.briefings.get(chave) ?? null, error: null }),
              }),
            }),
            insert: (registro: { chave_alerta: string }) => {
              if (estado.briefings.has(registro.chave_alerta)) {
                return Promise.resolve({ error: { message: "duplicate key" } });
              }
              estado.briefings.set(registro.chave_alerta, { ...registro });
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

function requisicao(autorizacao?: string): Request {
  const headers: Record<string, string> = {};
  if (autorizacao !== undefined) {
    headers.authorization = autorizacao;
  }
  return new Request("http://localhost/api/cron/briefing", { method: "GET", headers });
}

function alunaComPagamentoAtrasado() {
  const dezDiasAtras = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    id: "aluna_bia",
    nome: "Beatriz Lima",
    pagamentos: [{ status: "pendente", valor: 1200, vencimento: dezDiasAtras }],
    documentos: [],
    formularios: [],
    reunioes: [],
    tasks_asana: [],
  };
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SEGREDO);
  vi.stubEnv("ADRIANA_WHATSAPP", "11 98888-0000");
  estado.alunas = [alunaComPagamentoAtrasado()];
  estado.briefings.clear();
  vi.mocked(enviarMensagemWhatsApp).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/briefing — proteção", () => {
  it("sem Authorization responde 401", async () => {
    expect((await GET(requisicao())).status).toBe(401);
    expect(vi.mocked(enviarMensagemWhatsApp)).not.toHaveBeenCalled();
  });

  it("segredo errado responde 401", async () => {
    expect((await GET(requisicao("Bearer segredo_errado"))).status).toBe(401);
  });

  it("sem CRON_SECRET configurado responde 500", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(requisicao(`Bearer ${SEGREDO}`))).status).toBe(500);
  });
});

describe("GET /api/cron/briefing — execução", () => {
  it("gera, envia pro WhatsApp da Adriana e registra em briefings_enviados", async () => {
    const resposta = await GET(requisicao(`Bearer ${SEGREDO}`));

    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as { enviado: boolean; resumo: string };
    expect(corpo.enviado).toBe(true);

    expect(vi.mocked(enviarMensagemWhatsApp)).toHaveBeenCalledTimes(1);
    const [numero, mensagem] = vi.mocked(enviarMensagemWhatsApp).mock.calls[0];
    expect(numero).toBe("5511988880000");
    expect(mensagem).toContain("Bom dia, Adriana. 1 coisa hoje:");
    expect(mensagem).toContain("Beatriz Lima: pagamento de R$ 1200,00 vencido há 10 dias");

    const hoje = new Date().toISOString().slice(0, 10);
    expect(estado.briefings.get(`briefing_diario:${hoje}`)).toMatchObject({
      tipo: "briefing_diario",
      conteudo: mensagem,
    });
  });

  it("segundo disparo no mesmo dia não reenvia nem duplica registro", async () => {
    await GET(requisicao(`Bearer ${SEGREDO}`));
    const segunda = await GET(requisicao(`Bearer ${SEGREDO}`));

    expect(segunda.status).toBe(200);
    const corpo = (await segunda.json()) as { enviado: boolean; resumo: string };
    expect(corpo.enviado).toBe(false);
    expect(corpo.resumo).toContain("já enviado");
    expect(vi.mocked(enviarMensagemWhatsApp)).toHaveBeenCalledTimes(1);
    expect(estado.briefings.size).toBe(1);
  });

  it("sem nenhum furo, envia a mensagem de tudo em dia mesmo assim", async () => {
    estado.alunas = [];

    const resposta = await GET(requisicao(`Bearer ${SEGREDO}`));

    expect(resposta.status).toBe(200);
    const [, mensagem] = vi.mocked(enviarMensagemWhatsApp).mock.calls[0];
    expect(mensagem).toContain("Tudo em dia por aqui");
  });

  it("falha no envio responde 500 e NÃO registra o dia como enviado", async () => {
    vi.mocked(enviarMensagemWhatsApp).mockRejectedValue(
      new Error("Evolution API retornou HTTP 500")
    );

    const resposta = await GET(requisicao(`Bearer ${SEGREDO}`));

    expect(resposta.status).toBe(500);
    // Nada registrado: o próximo disparo tenta de novo.
    expect(estado.briefings.size).toBe(0);
  });

  it("sem ADRIANA_WHATSAPP configurado responde 500 sem enviar", async () => {
    vi.stubEnv("ADRIANA_WHATSAPP", "");

    const resposta = await GET(requisicao(`Bearer ${SEGREDO}`));

    expect(resposta.status).toBe(500);
    expect(vi.mocked(enviarMensagemWhatsApp)).not.toHaveBeenCalled();
  });
});
