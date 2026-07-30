import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Testa jaProcessado/marcarProcessado sem banco real: um fake in-memory do
 * cliente Supabase que simula a tabela eventos_processados com a restrição
 * UNIQUE(origem, evento_id_externo). Cenário central: o MESMO evento chegando
 * duas vezes.
 */

const h = vi.hoisted(() => {
  const store = new Set<string>();
  const chave = (origem: string, eventoId: string): string => `${origem}|${eventoId}`;

  // Recria o mínimo do query builder do supabase-js usado pelo helper.
  function fakeClient() {
    return {
      from() {
        const estado: {
          modo: "select" | "insert" | null;
          filtros: Record<string, string>;
          row: Record<string, string> | null;
        } = { modo: null, filtros: {}, row: null };

        const builder = {
          select() {
            estado.modo = "select";
            return builder;
          },
          eq(coluna: string, valor: string) {
            estado.filtros[coluna] = valor;
            return builder;
          },
          limit() {
            return builder;
          },
          insert(row: Record<string, string>) {
            estado.modo = "insert";
            estado.row = row;
            return builder;
          },
          then(
            aoResolver: (v: unknown) => unknown,
            aoRejeitar?: (r: unknown) => unknown,
          ) {
            let resultado: unknown;
            if (estado.modo === "select") {
              const existe = store.has(
                chave(
                  estado.filtros.origem ?? "",
                  estado.filtros.evento_id_externo ?? "",
                ),
              );
              resultado = { data: existe ? [{ id: "x" }] : [], error: null };
            } else if (estado.modo === "insert" && estado.row) {
              const k = chave(
                estado.row.origem ?? "",
                estado.row.evento_id_externo ?? "",
              );
              if (store.has(k)) {
                resultado = {
                  data: null,
                  error: { code: "23505", message: "duplicate" },
                };
              } else {
                store.add(k);
                resultado = { data: null, error: null };
              }
            } else {
              resultado = {
                data: null,
                error: { code: "?", message: "modo inesperado" },
              };
            }
            return Promise.resolve(resultado).then(aoResolver, aoRejeitar);
          },
        };
        return builder;
      },
    };
  }

  return { store, fakeClient };
});

vi.mock("@/lib/db/client", () => ({
  getServiceClient: () => h.fakeClient(),
}));

import { jaProcessado, marcarProcessado } from "@/lib/webhooks/idempotency";

beforeEach(() => {
  h.store.clear();
});

describe("idempotência de webhooks", () => {
  it("o mesmo evento chegando duas vezes: a 2ª é detectada como já processada", async () => {
    // 1ª chegada: ainda não processado → processa → marca.
    expect(await jaProcessado("asaas", "EVT-1")).toBe(false);
    await marcarProcessado("asaas", "EVT-1");

    // 2ª chegada do MESMO evento: agora jaProcessado bloqueia o reprocessamento.
    expect(await jaProcessado("asaas", "EVT-1")).toBe(true);
  });

  it("marcarProcessado é idempotente: marcar de novo não lança (corrida)", async () => {
    await marcarProcessado("asaas", "EVT-1");
    await expect(marcarProcessado("asaas", "EVT-1")).resolves.toBeUndefined();
    expect(await jaProcessado("asaas", "EVT-1")).toBe(true);
  });

  it("mesma id externa em origens diferentes é tratada separadamente", async () => {
    await marcarProcessado("asaas", "EVT-1");
    expect(await jaProcessado("calendly", "EVT-1")).toBe(false);
    expect(await jaProcessado("asaas", "EVT-1")).toBe(true);
  });

  it("evento novo ainda não foi processado", async () => {
    expect(await jaProcessado("asaas", "NUNCA-VISTO")).toBe(false);
  });
});
