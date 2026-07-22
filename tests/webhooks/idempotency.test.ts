import { beforeEach, describe, expect, it, vi } from "vitest";
import { jaProcessado, marcarProcessado } from "@/lib/webhooks/idempotency";

// Fake em memória da tabela eventos_processados, respeitando o UNIQUE
// (origem, evento_id_externo) como o banco real faz.
const { banco, criarSupabaseFalso } = vi.hoisted(() => {
  const banco = new Map<string, { id: string }>();
  let proximoId = 1;
  const chave = (origem: string, eventoId: string) => `${origem}:${eventoId}`;

  function criarSupabaseFalso() {
    return {
      from: (tabela: string) => {
        if (tabela !== "eventos_processados") {
          throw new Error(`Tabela inesperada no teste: ${tabela}`);
        }
        return {
          select: () => {
            const filtros: Record<string, string> = {};
            const consulta = {
              eq: (coluna: string, valor: string) => {
                filtros[coluna] = valor;
                return consulta;
              },
              maybeSingle: () => {
                const linha = banco.get(chave(filtros["origem"], filtros["evento_id_externo"]));
                return Promise.resolve({ data: linha ?? null, error: null });
              },
            };
            return consulta;
          },
          insert: (registro: { origem: string; evento_id_externo: string }) => {
            const id = chave(registro.origem, registro.evento_id_externo);
            if (banco.has(id)) {
              return Promise.resolve({
                error: { message: "duplicate key value violates unique constraint" },
              });
            }
            banco.set(id, { id: String(proximoId++) });
            return Promise.resolve({ error: null });
          },
        };
      },
    };
  }

  return { banco, criarSupabaseFalso };
});

vi.mock("@/lib/db/supabase", () => ({
  obterSupabase: criarSupabaseFalso,
}));

// Espelha o contrato que toda rota de webhook segue: checa ANTES de escrever,
// marca só DEPOIS do sucesso, e entrega repetida responde 200 sem reprocessar.
async function rotaDeWebhookSimulada(eventoId: string, processar: () => void): Promise<number> {
  if (await jaProcessado("asaas", eventoId)) {
    return 200;
  }
  processar();
  await marcarProcessado("asaas", eventoId, "processado no teste");
  return 200;
}

beforeEach(() => {
  banco.clear();
});

describe("jaProcessado / marcarProcessado", () => {
  it("evento nunca visto não está processado", async () => {
    expect(await jaProcessado("asaas", "evt_1")).toBe(false);
  });

  it("depois de marcar, o evento consta como processado", async () => {
    await marcarProcessado("asaas", "evt_1");
    expect(await jaProcessado("asaas", "evt_1")).toBe(true);
  });

  it("o mesmo id em origens diferentes são eventos distintos", async () => {
    await marcarProcessado("asaas", "evt_1");
    expect(await jaProcessado("calendly", "evt_1")).toBe(false);
  });

  it("marcar duas vezes estoura no UNIQUE do banco", async () => {
    await marcarProcessado("asaas", "evt_1");
    await expect(marcarProcessado("asaas", "evt_1")).rejects.toThrow(
      /Falha ao registrar evento processado/
    );
  });
});

describe("mesmo evento entregue duas vezes", () => {
  it("segunda entrega responde 200 igual, mas não processa nem duplica nada", async () => {
    let vezesProcessado = 0;
    const processar = () => {
      vezesProcessado += 1;
    };

    const primeiraResposta = await rotaDeWebhookSimulada("evt_pagamento_123", processar);
    const segundaResposta = await rotaDeWebhookSimulada("evt_pagamento_123", processar);

    expect(primeiraResposta).toBe(200);
    expect(segundaResposta).toBe(200);
    expect(vezesProcessado).toBe(1);
    expect(banco.size).toBe(1);
  });

  it("eventos diferentes são processados normalmente", async () => {
    let vezesProcessado = 0;
    const processar = () => {
      vezesProcessado += 1;
    };

    await rotaDeWebhookSimulada("evt_a", processar);
    await rotaDeWebhookSimulada("evt_b", processar);

    expect(vezesProcessado).toBe(2);
    expect(banco.size).toBe(2);
  });
});
