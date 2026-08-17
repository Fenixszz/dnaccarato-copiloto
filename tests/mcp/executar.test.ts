import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Testa o ponto único "executar ferramenta + auditar", garantindo que a origem
 * (mcp/dashboard), os detalhes e o resultado/erro são registrados igual para
 * qualquer chamador.
 */
const h = vi.hoisted(() => ({ registrarAuditoria: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/db/queries", () => ({ registrarAuditoria: h.registrarAuditoria }));

import { executarFerramentaAuditada } from "@/lib/mcp/executar";
import { ErroFerramenta, type FerramentaMcp } from "@/lib/mcp/tools";

function ferramentaFake(over: Partial<FerramentaMcp>): FerramentaMcp {
  return {
    name: "acao_teste",
    description: "",
    inputSchema: { type: "object", properties: {} },
    argsSchema: { parse: (x: unknown) => x } as unknown as FerramentaMcp["argsSchema"],
    executar: () => Promise.resolve({ ok: true }),
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("executarFerramentaAuditada", () => {
  it("sucesso: retorna resultado e audita com origem + detalhesBase + resumoAuditoria", async () => {
    const ferramenta = ferramentaFake({
      executar: () => Promise.resolve({ task_id: "t1" }),
      resumoAuditoria: () => ({ task_id: "t1" }),
    });
    const res = await executarFerramentaAuditada({
      ferramenta,
      args: { aluna_id: "a1" },
      origem: "dashboard",
      alunaId: "a1",
      detalhesBase: { por: "acao_rapida" },
    });

    expect(res).toEqual({ ok: true, resultado: { task_id: "t1" } });
    expect(h.registrarAuditoria).toHaveBeenCalledWith({
      origem: "dashboard",
      acao: "acao_teste",
      alunaId: "a1",
      resultado: "sucesso",
      detalhes: { por: "acao_rapida", task_id: "t1" },
    });
  });

  it("erro de negócio (ErroFerramenta): devolve mensagem e audita erro", async () => {
    const ferramenta = ferramentaFake({
      executar: () =>
        Promise.reject(new ErroFerramenta("Aluna sem telefone cadastrado.")),
    });
    const res = await executarFerramentaAuditada({
      ferramenta,
      args: {},
      origem: "dashboard",
    });

    expect(res.ok).toBe(false);
    expect(res.erroNegocio).toBe("Aluna sem telefone cadastrado.");
    expect(res.erroInterno).toBeUndefined();
    expect(h.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: "erro", origem: "dashboard" }),
    );
  });

  it("erro interno: não expõe mensagem, devolve erro cru para log e audita erro", async () => {
    const bug = new Error("stack interna");
    const ferramenta = ferramentaFake({ executar: () => Promise.reject(bug) });
    const res = await executarFerramentaAuditada({ ferramenta, args: {}, origem: "mcp" });

    expect(res.ok).toBe(false);
    expect(res.erroNegocio).toBeUndefined();
    expect(res.erroInterno).toBe(bug);
    expect(h.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: "erro", origem: "mcp" }),
    );
  });
});
