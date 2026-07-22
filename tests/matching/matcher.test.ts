import { describe, expect, it } from "vitest";
import { encontrarAluna, nomesProvavelmenteIguais, tokensDeNome } from "@/lib/matching/matcher";

const alunas = [
  {
    id: "a1",
    nome: "Maria Fernanda Costa",
    email: "maria.costa@example.com",
    telefone: "+55 11 91234-5678",
  },
  { id: "a2", nome: "João Conceição", email: null, telefone: "11987654321" },
  { id: "a3", nome: "Ana Paula Ribeiro", email: "ana.ribeiro@example.com", telefone: null },
  { id: "a4", nome: "Ana Paula Mendes", email: null, telefone: null },
  { id: "a5", nome: "Maria de Souza", email: null, telefone: null },
];

describe("encontrarAluna — casos que DEVEM casar", () => {
  it("1. nome com acento casa com cadastro sem acento (e vice-versa)", () => {
    const resultado = encontrarAluna(alunas, { nome: "Joao Conceicao" });
    expect(resultado).toMatchObject({ corresponde: true, criterio: "nome" });
    expect(resultado.corresponde && resultado.aluna.id).toBe("a2");
  });

  it("2. telefone sem DDI casa com cadastro com DDI", () => {
    const resultado = encontrarAluna(alunas, { telefone: "11912345678" });
    expect(resultado).toMatchObject({ corresponde: true, criterio: "telefone" });
    expect(resultado.corresponde && resultado.aluna.id).toBe("a1");
  });

  it("3. telefone com DDI e formatação casa com cadastro só de dígitos", () => {
    const resultado = encontrarAluna(alunas, { telefone: "+55 (11) 98765-4321" });
    expect(resultado).toMatchObject({ corresponde: true, criterio: "telefone" });
    expect(resultado.corresponde && resultado.aluna.id).toBe("a2");
  });

  it("4. email com maiúsculas e espaços casa com o cadastrado", () => {
    const resultado = encontrarAluna(alunas, { email: " MARIA.COSTA@Example.com " });
    expect(resultado).toMatchObject({ corresponde: true, criterio: "email" });
    expect(resultado.corresponde && resultado.aluna.id).toBe("a1");
  });

  it("5. nome com sobrenome incompleto casa quando é a única candidata", () => {
    const resultado = encontrarAluna(alunas, { nome: "Maria Costa" });
    expect(resultado).toMatchObject({ corresponde: true, criterio: "nome" });
    expect(resultado.corresponde && resultado.aluna.id).toBe("a1");
  });

  it("6. conectivos (de/da/dos) não atrapalham o matching de nome", () => {
    const resultado = encontrarAluna(alunas, { nome: "Maria Souza" });
    expect(resultado).toMatchObject({ corresponde: true, criterio: "nome" });
    expect(resultado.corresponde && resultado.aluna.id).toBe("a5");
  });

  it("7. email tem prioridade sobre nome parecido de outra aluna", () => {
    // Nome aponta pra a4 (Ana Paula Mendes), mas o email é da a3.
    const resultado = encontrarAluna(alunas, {
      nome: "Ana Paula Mendes",
      email: "ana.ribeiro@example.com",
    });
    expect(resultado).toMatchObject({ corresponde: true, criterio: "email" });
    expect(resultado.corresponde && resultado.aluna.id).toBe("a3");
  });
});

describe("encontrarAluna — casos que NÃO devem casar (falso positivo é pior)", () => {
  it("8. nomes parecidos mas diferentes não casam: Maria vs Mariana", () => {
    expect(encontrarAluna(alunas, { nome: "Mariana Fernanda Costa" })).toEqual({
      corresponde: false,
    });
  });

  it("9. mesmo primeiro nome com sobrenome diferente não casa", () => {
    expect(encontrarAluna(alunas, { nome: "João Cardoso" })).toEqual({ corresponde: false });
  });

  it("10. primeiro nome sozinho nunca casa por nome", () => {
    expect(encontrarAluna(alunas, { nome: "Maria" })).toEqual({ corresponde: false });
  });

  it("11. nome ambíguo entre duas alunas não casa com nenhuma", () => {
    // "Ana Paula" é subconjunto tanto de "Ana Paula Ribeiro" quanto de
    // "Ana Paula Mendes" — escolher seria chute.
    expect(encontrarAluna(alunas, { nome: "Ana Paula" })).toEqual({ corresponde: false });
  });

  it("12. telefone diferente não casa mesmo com DDD igual", () => {
    expect(encontrarAluna(alunas, { telefone: "11955550000" })).toEqual({ corresponde: false });
  });

  it("13. email desconhecido não casa nem parcialmente", () => {
    expect(encontrarAluna(alunas, { email: "maria.costa@outro-dominio.com" })).toEqual({
      corresponde: false,
    });
  });

  it("14. contato vazio ou só com espaços não casa com nada", () => {
    expect(encontrarAluna(alunas, {})).toEqual({ corresponde: false });
    expect(encontrarAluna(alunas, { nome: "  ", email: "", telefone: " " })).toEqual({
      corresponde: false,
    });
  });
});

describe("nomesProvavelmenteIguais", () => {
  it("aceita igualdade normalizada e subconjunto com primeiro nome idêntico", () => {
    expect(nomesProvavelmenteIguais("José da Silva", "Jose Silva")).toBe(true);
    expect(nomesProvavelmenteIguais("Maria Costa", "Maria Fernanda Costa")).toBe(true);
  });

  it("rejeita primeiro nome divergente mesmo com sobrenomes iguais", () => {
    expect(nomesProvavelmenteIguais("Maria Silva", "Mariana Silva")).toBe(false);
    expect(nomesProvavelmenteIguais("Fernanda Costa", "Maria Fernanda Costa")).toBe(false);
  });

  it("exige pelo menos dois tokens no nome mais curto", () => {
    expect(nomesProvavelmenteIguais("Maria", "Maria Fernanda Costa")).toBe(false);
  });
});

describe("tokensDeNome", () => {
  it("normaliza, quebra em tokens e descarta conectivos", () => {
    expect(tokensDeNome("Maria de Souza dos Santos e Silva")).toEqual([
      "maria",
      "souza",
      "santos",
      "silva",
    ]);
  });
});
