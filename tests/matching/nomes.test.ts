import { describe, expect, it } from "vitest";
import { nomesCorrespondem, normalizarNome } from "@/lib/matching/nomes";

describe("normalizarNome", () => {
  it("remove acentos", () => {
    expect(normalizarNome("João Conceição")).toBe("joao conceicao");
  });

  it("normaliza caixa e espaços extras", () => {
    expect(normalizarNome("  MARIA   da Silva ")).toBe("maria da silva");
  });

  it("mantém nome já normalizado como está", () => {
    expect(normalizarNome("ana souza")).toBe("ana souza");
  });
});

describe("nomesCorrespondem", () => {
  it("aceita grafias diferentes do mesmo nome", () => {
    expect(nomesCorrespondem("João Conceição", "joao   conceicao")).toBe(true);
  });

  it("rejeita nomes diferentes", () => {
    expect(nomesCorrespondem("João Conceição", "João Cardoso")).toBe(false);
  });

  it("rejeita nome vazio ou só espaços", () => {
    expect(nomesCorrespondem("", "João")).toBe(false);
    expect(nomesCorrespondem("   ", "João")).toBe(false);
  });
});
