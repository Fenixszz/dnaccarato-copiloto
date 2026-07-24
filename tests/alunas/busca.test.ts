import { describe, expect, it } from "vitest";
import { filtrarAlunas, type AlunaLista } from "@/lib/alunas/busca";

const ALUNAS: AlunaLista[] = [
  {
    id: "a1",
    nome: "Ana Paula Ribeiro",
    email: "ana.ribeiro@example.com",
    telefone: "+55 11 91111-0001",
  },
  { id: "a2", nome: "Beatriz Lima", email: null, telefone: "11922220002" },
  { id: "a3", nome: "João Conceição", email: "joao@example.com", telefone: null },
];

describe("filtrarAlunas", () => {
  it("termo vazio retorna todas", () => {
    expect(filtrarAlunas(ALUNAS, "")).toHaveLength(3);
    expect(filtrarAlunas(ALUNAS, "   ")).toHaveLength(3);
  });

  it("busca por nome ignora acento e caixa", () => {
    expect(filtrarAlunas(ALUNAS, "joao").map((a) => a.id)).toEqual(["a3"]);
    expect(filtrarAlunas(ALUNAS, "RIBEIRO").map((a) => a.id)).toEqual(["a1"]);
  });

  it("busca por parte do email", () => {
    expect(filtrarAlunas(ALUNAS, "ana.ribeiro").map((a) => a.id)).toEqual(["a1"]);
  });

  it("busca por telefone em qualquer formato (só dígitos contam)", () => {
    expect(filtrarAlunas(ALUNAS, "9222").map((a) => a.id)).toEqual(["a2"]);
    expect(filtrarAlunas(ALUNAS, "(11) 91111-0001").map((a) => a.id)).toEqual(["a1"]);
  });

  it("sem correspondência retorna vazio", () => {
    expect(filtrarAlunas(ALUNAS, "zoe")).toEqual([]);
  });

  it("não quebra com email/telefone nulos", () => {
    expect(filtrarAlunas(ALUNAS, "beatriz").map((a) => a.id)).toEqual(["a2"]);
  });
});
