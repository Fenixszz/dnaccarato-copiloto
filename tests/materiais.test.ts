import { describe, it, expect } from "vitest";
import { acharAlunaPorNomePasta } from "@/lib/materiais";

describe("acharAlunaPorNomePasta", () => {
  const alunas = [
    { id: "a1", nome: "Ana Prado" },
    { id: "a2", nome: "Bruna Lima" },
    { id: "a3", nome: "Carla Souza" },
  ];

  it("casa o nome da subpasta com a aluna (ignora caixa/acentos)", () => {
    expect(acharAlunaPorNomePasta(alunas, "ana prado")).toBe("a1");
    expect(acharAlunaPorNomePasta(alunas, "Bruna Lima")).toBe("a2");
  });

  it("retorna null quando nenhuma aluna bate (não inventa aluna)", () => {
    expect(acharAlunaPorNomePasta(alunas, "Fulano Desconhecido")).toBeNull();
  });

  it("retorna null para lista de alunas vazia", () => {
    expect(acharAlunaPorNomePasta([], "Ana Prado")).toBeNull();
  });
});
