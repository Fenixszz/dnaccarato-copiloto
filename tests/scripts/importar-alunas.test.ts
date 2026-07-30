import { describe, it, expect } from "vitest";
import {
  parseLinhaCSV,
  parseCSV,
  parseArquivo,
  validarAlunas,
  formatoDoArquivo,
} from "@/scripts/importar-alunas";

describe("parseLinhaCSV", () => {
  it("quebra campos simples", () => {
    expect(parseLinhaCSV("Ana,ana@ex.com,11999")).toEqual(["Ana", "ana@ex.com", "11999"]);
  });

  it("respeita vírgula dentro de aspas", () => {
    expect(parseLinhaCSV('"Souza, Ana",ana@ex.com')).toEqual([
      "Souza, Ana",
      "ana@ex.com",
    ]);
  });

  it('trata aspas escapadas ("")', () => {
    expect(parseLinhaCSV('"disse ""oi""",x')).toEqual(['disse "oi"', "x"]);
  });
});

describe("parseCSV", () => {
  it("usa o cabeçalho como chaves (case-insensitive) e ignora linhas vazias", () => {
    const csv = "Nome,Email,Telefone\nAna,ana@ex.com,11999\n\nBruna,bruna@ex.com,11888\n";
    expect(parseCSV(csv)).toEqual([
      { nome: "Ana", email: "ana@ex.com", telefone: "11999" },
      { nome: "Bruna", email: "bruna@ex.com", telefone: "11888" },
    ]);
  });

  it("retorna vazio para conteúdo sem linhas", () => {
    expect(parseCSV("")).toEqual([]);
  });
});

describe("parseArquivo", () => {
  it("faz parse de JSON array", () => {
    const json = JSON.stringify([{ nome: "Ana", email: "ana@ex.com" }]);
    expect(parseArquivo(json, "json")).toEqual([{ nome: "Ana", email: "ana@ex.com" }]);
  });

  it("rejeita JSON que não é array", () => {
    expect(() => parseArquivo('{"nome":"Ana"}', "json")).toThrow();
  });
});

describe("validarAlunas", () => {
  it("aceita registros válidos e normaliza email vazio para undefined", () => {
    const { validas, erros } = validarAlunas([
      { nome: "Ana", email: "ana@ex.com", telefone: "11999" },
      { nome: "Bruna", email: "", telefone: "" },
    ]);
    expect(erros).toEqual([]);
    expect(validas[0]).toEqual({ nome: "Ana", email: "ana@ex.com", telefone: "11999" });
    expect(validas[1]).toEqual({ nome: "Bruna", email: undefined, telefone: undefined });
  });

  it("reporta nome faltando e email inválido, com o número da linha", () => {
    const { validas, erros } = validarAlunas([
      { nome: "", email: "x" },
      { nome: "Ok", email: "nao-eh-email" },
    ]);
    expect(validas).toEqual([]);
    expect(erros).toHaveLength(2);
    expect(erros[0]?.linha).toBe(2); // 1ª linha de dados = linha 2 do arquivo
    expect(erros[1]?.linha).toBe(3);
  });
});

describe("formatoDoArquivo", () => {
  it("detecta json e csv pela extensão", () => {
    expect(formatoDoArquivo("lista.json")).toBe("json");
    expect(formatoDoArquivo("lista.csv")).toBe("csv");
    expect(formatoDoArquivo("lista.txt")).toBe("csv"); // fallback
  });
});
