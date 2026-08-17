import { describe, it, expect } from "vitest";
import {
  avaliarCreditos,
  diasRestantes,
  semaforoDoNivel,
} from "@/lib/creditos/avaliacao";

describe("semaforoDoNivel", () => {
  it("mapeia nível → cor do indicador", () => {
    expect(semaforoDoNivel("ok")).toBe("verde");
    expect(semaforoDoNivel("leve")).toBe("amarelo");
    expect(semaforoDoNivel("claro")).toBe("vermelho");
    expect(semaforoDoNivel("zerado")).toBe("vermelho");
  });
});

const RECARGA = 10000; // R$ 100,00 de referência

describe("diasRestantes", () => {
  it("estima pelo saldo / média diária (piso)", () => {
    expect(diasRestantes(10000, 1500)).toBe(6); // 100 / 15 = 6,6 → 6
  });
  it("null quando não há consumo", () => {
    expect(diasRestantes(10000, 0)).toBeNull();
  });
});

describe("avaliarCreditos", () => {
  it("nível ok acima de 30% da última recarga: sem mensagem", () => {
    const a = avaliarCreditos({
      saldoCentavos: 5000, // 50%
      ultimaRecargaCentavos: RECARGA,
      mediaDiariaCentavos: 200,
    });
    expect(a.nivel).toBe("ok");
    expect(a.mensagem).toBeNull();
  });

  it("aviso leve abaixo de 30%, com dias restantes", () => {
    const a = avaliarCreditos({
      saldoCentavos: 2500, // 25%
      ultimaRecargaCentavos: RECARGA,
      mediaDiariaCentavos: 500, // 25.00 / 5.00 = 5 dias
    });
    expect(a.nivel).toBe("leve");
    expect(a.diasRestantes).toBe(5);
    expect(a.mensagem).toContain("5 dias");
  });

  it("aviso claro abaixo de 10%, lembrando a chave Pix", () => {
    const a = avaliarCreditos({
      saldoCentavos: 800, // 8%
      ultimaRecargaCentavos: RECARGA,
      mediaDiariaCentavos: 200,
      pixChave: "joao@pix.com",
    });
    expect(a.nivel).toBe("claro");
    expect(a.mensagem).toContain("joao@pix.com");
  });

  it("zerado/negativo: serviço segue normal, valor a acertar", () => {
    const a = avaliarCreditos({
      saldoCentavos: -1500,
      ultimaRecargaCentavos: RECARGA,
      mediaDiariaCentavos: 300,
      pixChave: "joao@pix.com",
    });
    expect(a.nivel).toBe("zerado");
    expect(a.mensagem).toContain("continua rodando normalmente");
    expect(a.mensagem).toContain("15,00"); // R$ 15,00 a acertar
    expect(a.mensagem).toContain("joao@pix.com");
  });

  it("sem recarga de referência e saldo positivo: fica ok", () => {
    const a = avaliarCreditos({
      saldoCentavos: 100,
      ultimaRecargaCentavos: null,
      mediaDiariaCentavos: 0,
    });
    expect(a.nivel).toBe("ok");
    expect(a.mensagem).toBeNull();
  });
});
