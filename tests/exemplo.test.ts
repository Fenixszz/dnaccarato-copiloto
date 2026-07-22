import { describe, expect, it } from "vitest";

// Teste de fumaça da infraestrutura: se este arquivo falhar, o problema é a
// configuração do Vitest, não o código do projeto.
describe("infraestrutura de testes", () => {
  it("executa um teste síncrono", () => {
    expect(1 + 1).toBe(2);
  });

  it("executa um teste assíncrono", async () => {
    const valor = await Promise.resolve("ok");
    expect(valor).toBe("ok");
  });
});
