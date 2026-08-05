import { describe, it, expect } from "vitest";
import {
  normalizarTelefone,
  normalizarEmail,
  emailsCasam,
  telefonesCasam,
  pontuarMatch,
  candidatosCasam,
  encontrarMelhorMatch,
  type Candidato,
} from "@/lib/matching/matcher";

describe("normalização", () => {
  it("telefone vira só dígitos", () => {
    expect(normalizarTelefone("+55 (11) 99999-8888")).toBe("5511999998888");
  });

  it("email é aparado e minúsculo", () => {
    expect(normalizarEmail("  Ana.Silva@EX.com  ")).toBe("ana.silva@ex.com");
  });
});

describe("emailsCasam", () => {
  it("casa ignorando caixa e espaços", () => {
    expect(emailsCasam("Ana@EX.com", " ana@ex.com ")).toBe(true);
  });
  it("não casa emails diferentes", () => {
    expect(emailsCasam("ana@ex.com", "bruna@ex.com")).toBe(false);
  });
});

describe("telefonesCasam", () => {
  it("casa com e sem DDI", () => {
    expect(telefonesCasam("+55 11 99999-8888", "(11) 99999-8888")).toBe(true);
  });
  it("casa mesmo número com máscaras diferentes", () => {
    expect(telefonesCasam("11999998888", "11 9 9999-8888")).toBe(true);
  });
  it("não casa números diferentes", () => {
    expect(telefonesCasam("11999998888", "11988887777")).toBe(false);
  });
  it("não casa por sufixo curto demais", () => {
    expect(telefonesCasam("99998888", "5511999998888")).toBe(false);
  });
});

describe("pontuarMatch / candidatosCasam", () => {
  it("nome com acento casa com nome sem acento", () => {
    expect(candidatosCasam({ nome: "José Antônio" }, { nome: "Jose Antonio" })).toBe(
      true,
    );
  });

  it("nome com ordem trocada casa", () => {
    expect(candidatosCasam({ nome: "Silva, Maria" }, { nome: "Maria Silva" })).toBe(true);
  });

  it("nomes parecidos mas diferentes NÃO casam (Ana Silva x Ana Souza)", () => {
    expect(candidatosCasam({ nome: "Ana Silva" }, { nome: "Ana Souza" })).toBe(false);
  });

  it("nomes com sobrenome diferente NÃO casam (Ana Paula Souza x Ana Paula Lima)", () => {
    expect(candidatosCasam({ nome: "Ana Paula Souza" }, { nome: "Ana Paula Lima" })).toBe(
      false,
    );
  });

  it("email igual decide o match mesmo com nome diferente", () => {
    const r = pontuarMatch(
      { nome: "Maria S.", email: "cliente@ex.com" },
      { nome: "Maria Aparecida Santos", email: "CLIENTE@ex.com" },
    );
    expect(r.emailIgual).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0.95);
    expect(candidatosCasam({ email: "x@ex.com" }, { email: "X@EX.com" })).toBe(true);
  });

  it("telefone igual decide o match", () => {
    expect(
      candidatosCasam(
        { nome: "Fulana", telefone: "+55 11 99999-8888" },
        { nome: "Outra Pessoa", telefone: "11999998888" },
      ),
    ).toBe(true);
  });

  it("identificador forte + nome plausível → score 1 (corroboração)", () => {
    const r = pontuarMatch(
      { nome: "Ana Prado", telefone: "11999998888" },
      { nome: "Ana Prado Souza", telefone: "5511999998888" },
    );
    expect(r.telefoneIgual).toBe(true);
    expect(r.score).toBe(1);
  });

  it("email e nome diferentes NÃO casam", () => {
    expect(
      candidatosCasam(
        { nome: "Ana Silva", email: "ana@ex.com" },
        { nome: "Bruna Lima", email: "bruna@ex.com" },
      ),
    ).toBe(false);
  });

  it("sem dados em comum retorna score 0", () => {
    expect(pontuarMatch({}, { nome: "Ana" }).score).toBe(0);
  });
});

describe("encontrarMelhorMatch", () => {
  const alunas = [
    { id: "a1", nome: "Ana Prado", email: "ana@ex.com", telefone: "11999990001" },
    { id: "a2", nome: "Bruna Lima", email: "bruna@ex.com", telefone: "11999990002" },
    { id: "a3", nome: "Ana Prado Souza", email: null, telefone: "11999990003" },
  ];
  const extrair = (a: (typeof alunas)[number]): Candidato => ({
    nome: a.nome,
    email: a.email,
    telefone: a.telefone,
  });

  it("retorna o de maior score (email decide entre nomes parecidos)", () => {
    const r = encontrarMelhorMatch({ nome: "Ana", email: "ANA@ex.com" }, alunas, extrair);
    expect(r?.registro.id).toBe("a1");
  });

  it("retorna null quando ninguém casa", () => {
    const r = encontrarMelhorMatch(
      { nome: "Pessoa Inexistente", email: "ninguem@ex.com" },
      alunas,
      extrair,
    );
    expect(r).toBeNull();
  });
});
