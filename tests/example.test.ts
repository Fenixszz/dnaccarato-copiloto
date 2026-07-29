import { describe, it, expect } from "vitest";

/**
 * Teste de exemplo — serve de referência para a estrutura de testes do projeto
 * e como "smoke test" de que o Vitest está configurado corretamente.
 */
describe("exemplo", () => {
  it("soma dois números", () => {
    expect(1 + 1).toBe(2);
  });

  it("suporta asserções assíncronas", async () => {
    const valor = await Promise.resolve("ok");
    expect(valor).toBe("ok");
  });
});
