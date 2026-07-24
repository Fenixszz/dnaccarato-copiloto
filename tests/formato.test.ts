import { describe, expect, it } from "vitest";
import { formatarData, formatarDataHora, formatarReais } from "@/lib/formato";

describe("formatarReais", () => {
  it("formata com separador de milhar e vírgula decimal", () => {
    expect(formatarReais(1200)).toBe("R$ 1.200,00");
    expect(formatarReais(1234567.5)).toBe("R$ 1.234.567,50");
    expect(formatarReais(0)).toBe("R$ 0,00");
  });

  it("mantém o sinal em valores negativos", () => {
    expect(formatarReais(-99.9)).toBe("-R$ 99,90");
  });
});

describe("formatarData", () => {
  it("converte UTC pra Brasília (UTC-3) e formata dd/mm/aaaa", () => {
    expect(formatarData("2026-07-22T12:00:00.000Z")).toBe("22/07/2026");
  });

  it("vira o dia quando o UTC de madrugada é a noite anterior em Brasília", () => {
    // 01:00 UTC = 22:00 do dia anterior em Brasília.
    expect(formatarData("2026-07-22T01:00:00.000Z")).toBe("21/07/2026");
  });

  it("null/undefined viram travessão", () => {
    expect(formatarData(null)).toBe("—");
    expect(formatarData(undefined)).toBe("—");
  });
});

describe("formatarDataHora", () => {
  it("mostra data e hora de Brasília", () => {
    expect(formatarDataHora("2026-07-22T12:00:00.000Z")).toBe("22/07/2026 09:00");
  });

  it("null vira travessão", () => {
    expect(formatarDataHora(null)).toBe("—");
  });
});
