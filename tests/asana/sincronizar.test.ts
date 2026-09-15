import { describe, it, expect } from "vitest";
import {
  normalizarNomeCard,
  statusDaTarefa,
  resolverAlunaId,
} from "@/lib/asana/sincronizarTarefas";

const ALUNAS = [
  { id: "1", nome: "Maria Eduarda Kawamoto" },
  { id: "2", nome: "Rafaela Fera" },
  { id: "3", nome: "Marina Motta" },
  { id: "4", nome: "Ana Clara" },
  { id: "5", nome: "Antonella Bacchin" },
  { id: "6", nome: "Guilherme Velloso" },
];

describe("normalizarNomeCard", () => {
  it("remove traço e espaços do fim", () => {
    expect(normalizarNomeCard("DUDA -")).toBe("DUDA");
    expect(normalizarNomeCard("Rafa ")).toBe("Rafa");
    expect(normalizarNomeCard("  Ana clara  ")).toBe("Ana clara");
  });
});

describe("statusDaTarefa", () => {
  it("concluída só quando completed === true", () => {
    expect(statusDaTarefa(true)).toBe("concluida");
    expect(statusDaTarefa(false)).toBe("em_andamento");
    expect(statusDaTarefa(undefined)).toBe("em_andamento");
  });
});

describe("resolverAlunaId", () => {
  it("usa apelidos confirmados (DUDA, Rafa, Antonella, Guilherme Veloso)", () => {
    expect(resolverAlunaId("DUDA -", ALUNAS)).toBe("1");
    expect(resolverAlunaId("Rafa", ALUNAS)).toBe("2");
    expect(resolverAlunaId("Antonella", ALUNAS)).toBe("5");
    expect(resolverAlunaId("Guilherme Veloso ", ALUNAS)).toBe("6");
  });

  it("casa por nome quando não há apelido", () => {
    expect(resolverAlunaId("marina Motta", ALUNAS)).toBe("3");
    expect(resolverAlunaId("Ana clara", ALUNAS)).toBe("4");
  });

  it("retorna null quando nenhuma aluna casa (→ criar)", () => {
    expect(resolverAlunaId("Evelyn", ALUNAS)).toBeNull();
    expect(resolverAlunaId("paula (belem)", ALUNAS)).toBeNull();
  });

  it("fallback de nome exato evita duplicar (Evelyn já existe → casa)", () => {
    const comEvelyn = [...ALUNAS, { id: "9", nome: "Evelyn" }];
    expect(resolverAlunaId("Evelyn", comEvelyn)).toBe("9");
    const comPaula = [...ALUNAS, { id: "10", nome: "paula (belem)" }];
    expect(resolverAlunaId("paula (belem)", comPaula)).toBe("10");
  });
});
