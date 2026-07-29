import { describe, it, expect } from "vitest";
import {
  normalizarNome,
  tokensNome,
  similaridadeNomes,
  mesmoNome,
  encontrarMatches,
} from "@/lib/matching";

describe("normalizarNome", () => {
  it("remove acentos, baixa a caixa e colapsa espaços", () => {
    expect(normalizarNome("  María  Silva  ")).toBe("maria silva");
  });

  it("trata pontuação e símbolos como separadores", () => {
    expect(normalizarNome("José-Carlos/Souza")).toBe("jose carlos souza");
    // O apóstrofo também separa: "D'Ávila" vira dois tokens.
    expect(normalizarNome("D'Ávila")).toBe("d avila");
  });

  it("retorna string vazia para entrada só com símbolos", () => {
    expect(normalizarNome("!!! --- ")).toBe("");
  });
});

describe("tokensNome", () => {
  it("divide em palavras", () => {
    expect(tokensNome("María de Ávila")).toEqual(["maria", "de", "avila"]);
  });

  it("retorna lista vazia para nome vazio", () => {
    expect(tokensNome("   ")).toEqual([]);
  });
});

describe("similaridadeNomes", () => {
  it("é 1 para nomes idênticos após normalização", () => {
    expect(similaridadeNomes("María Silva", "maria silva")).toBe(1);
  });

  it("é 1 quando ambos são vazios", () => {
    expect(similaridadeNomes("", "")).toBe(1);
  });

  it("é 0 quando um é vazio e o outro não", () => {
    expect(similaridadeNomes("", "Maria")).toBe(0);
  });

  it("é insensível à ordem dos tokens", () => {
    expect(similaridadeNomes("Maria Silva", "Silva Maria")).toBe(1);
  });

  it("dá score parcial para sobreposição parcial", () => {
    // {maria, silva} vs {maria, souza} → interseção 1, união 3 → 1/3
    expect(similaridadeNomes("Maria Silva", "Maria Souza")).toBeCloseTo(1 / 3);
  });

  it("é 0 para nomes totalmente diferentes", () => {
    expect(similaridadeNomes("Ana Paula", "Roberto Costa")).toBe(0);
  });
});

describe("mesmoNome", () => {
  it("considera match acima do limiar padrão", () => {
    // {joao, pedro, souza} vs {joao, souza} → 2/3 ≈ 0.67 ≥ 0.6
    expect(mesmoNome("João Pedro Souza", "joao souza")).toBe(true);
  });

  it("não considera match abaixo do limiar", () => {
    expect(mesmoNome("Maria Silva", "Maria Souza")).toBe(false);
  });

  it("respeita limiar customizado", () => {
    // 1/3 ≈ 0.33 ≥ 0.3
    expect(mesmoNome("Maria Silva", "Maria Souza", 0.3)).toBe(true);
  });
});

describe("encontrarMatches", () => {
  const candidatos = [
    { id: 1, nome: "María Silva" },
    { id: 2, nome: "Roberto Costa" },
    { id: 3, nome: "Maria Silva Souza" },
  ];

  it("retorna matches ordenados do maior score para o menor", () => {
    const resultado = encontrarMatches("Maria Silva", candidatos, (c) => c.nome);
    // id 1 (score 1.0) e id 3 (2/3 ≈ 0.67) batem; id 2 fica de fora.
    expect(resultado.map((r) => r.registro.id)).toEqual([1, 3]);
    expect(resultado[0]?.score).toBeGreaterThanOrEqual(resultado[1]?.score ?? 0);
  });

  it("retorna lista vazia quando nada bate", () => {
    const resultado = encontrarMatches("Fernanda Lima", candidatos, (c) => c.nome);
    expect(resultado).toEqual([]);
  });
});
