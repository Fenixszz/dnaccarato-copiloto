import { describe, it, expect } from "vitest";
import { alunaCasaBusca, filtrarAlunas } from "@/lib/alunas/busca";

const ANA = {
  id: "1",
  nome: "Ana D'Ávila Prado",
  email: "ana.prado@exemplo.com",
  telefone: "+55 11 90000-0001",
  criado_em: "2026-08-01T00:00:00Z",
};
const BRUNA = {
  id: "2",
  nome: "Bruna Lima",
  email: "bruna@teste.com",
  telefone: "(21) 98888-7777",
  criado_em: "2026-08-02T00:00:00Z",
};
const SEM_CONTATO = {
  id: "3",
  nome: "Carla Souza",
  email: null,
  telefone: null,
  criado_em: "2026-08-03T00:00:00Z",
};

describe("alunaCasaBusca", () => {
  it("termo vazio casa com todas", () => {
    expect(alunaCasaBusca(ANA, "")).toBe(true);
    expect(alunaCasaBusca(SEM_CONTATO, "   ")).toBe(true);
  });

  it("casa por nome ignorando acento e caixa", () => {
    expect(alunaCasaBusca(ANA, "avila")).toBe(true); // "Ávila" sem acento
    expect(alunaCasaBusca(ANA, "d'ávila")).toBe(true);
    expect(alunaCasaBusca(ANA, "ANA prado")).toBe(true);
    expect(alunaCasaBusca(ANA, "bruna")).toBe(false);
  });

  it("casa por e-mail (substring)", () => {
    expect(alunaCasaBusca(ANA, "ana.prado@exemplo")).toBe(true);
    expect(alunaCasaBusca(BRUNA, "@teste.com")).toBe(true);
  });

  it("casa por telefone ignorando máscara e DDI", () => {
    expect(alunaCasaBusca(ANA, "90000-0001")).toBe(true);
    expect(alunaCasaBusca(ANA, "900000001")).toBe(true);
    expect(alunaCasaBusca(BRUNA, "988887777")).toBe(true);
    expect(alunaCasaBusca(ANA, "988887777")).toBe(false);
  });

  it("não quebra com email/telefone nulos", () => {
    expect(alunaCasaBusca(SEM_CONTATO, "carla")).toBe(true);
    expect(alunaCasaBusca(SEM_CONTATO, "9999")).toBe(false);
    expect(alunaCasaBusca(SEM_CONTATO, "@exemplo")).toBe(false);
  });
});

describe("filtrarAlunas", () => {
  const todas = [ANA, BRUNA, SEM_CONTATO];

  it("retorna todas quando o termo é vazio, preservando a ordem", () => {
    expect(filtrarAlunas(todas, "")).toEqual(todas);
  });

  it("filtra pelo termo", () => {
    expect(filtrarAlunas(todas, "lima")).toEqual([BRUNA]);
    expect(filtrarAlunas(todas, "souza").map((a) => a.id)).toEqual(["3"]);
    expect(filtrarAlunas(todas, "inexistente")).toEqual([]);
  });
});
