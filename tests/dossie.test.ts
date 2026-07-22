import { describe, expect, it } from "vitest";
import { pagamentoEstaPago, situacaoDePagamentos } from "@/lib/dossie";

const HOJE = new Date("2026-07-22T12:00:00.000Z");

function pagamento(campos: {
  status: string;
  valor?: number;
  vencimento?: string | null;
  pago_em?: string | null;
}) {
  return {
    id: "pag_teste",
    valor: 1200,
    vencimento: null,
    pago_em: null,
    ...campos,
  };
}

describe("pagamentoEstaPago", () => {
  it("aceita os status nossos e os do Asaas, em qualquer caixa", () => {
    expect(pagamentoEstaPago("pago")).toBe(true);
    expect(pagamentoEstaPago("CONFIRMED")).toBe(true);
    expect(pagamentoEstaPago("RECEIVED")).toBe(true);
    expect(pagamentoEstaPago("pendente")).toBe(false);
    expect(pagamentoEstaPago("OVERDUE")).toBe(false);
  });
});

describe("situacaoDePagamentos", () => {
  it("sem pagamentos: sem_registros", () => {
    expect(situacaoDePagamentos([], HOJE)).toEqual({
      situacao: "sem_registros",
      ultimo_pagamento_em: null,
      quantidade_em_atraso: 0,
      total_em_atraso: 0,
    });
  });

  it("pagamento pago: em dia, com data do último pagamento", () => {
    const resultado = situacaoDePagamentos(
      [pagamento({ status: "CONFIRMED", vencimento: "2026-07-10", pago_em: "2026-07-10" })],
      HOJE
    );
    expect(resultado.situacao).toBe("em_dia");
    expect(resultado.ultimo_pagamento_em).toBe("2026-07-10");
  });

  it("não pago com vencimento passado: atrasado, somando valores", () => {
    const resultado = situacaoDePagamentos(
      [
        pagamento({ status: "pendente", valor: 1200, vencimento: "2026-07-12" }),
        pagamento({ status: "OVERDUE", valor: 300, vencimento: "2026-06-12" }),
        pagamento({ status: "pago", vencimento: "2026-05-12", pago_em: "2026-05-12" }),
      ],
      HOJE
    );
    expect(resultado.situacao).toBe("atrasado");
    expect(resultado.quantidade_em_atraso).toBe(2);
    expect(resultado.total_em_atraso).toBe(1500);
    expect(resultado.ultimo_pagamento_em).toBe("2026-05-12");
  });

  it("pendente com vencimento futuro: em dia", () => {
    const resultado = situacaoDePagamentos(
      [pagamento({ status: "pendente", vencimento: "2026-08-01" })],
      HOJE
    );
    expect(resultado.situacao).toBe("em_dia");
  });

  it("pendente sem vencimento não conta como atraso", () => {
    const resultado = situacaoDePagamentos([pagamento({ status: "pendente" })], HOJE);
    expect(resultado.situacao).toBe("em_dia");
    expect(resultado.quantidade_em_atraso).toBe(0);
  });

  it("último pagamento é o mais recente entre vários", () => {
    const resultado = situacaoDePagamentos(
      [
        pagamento({ status: "pago", pago_em: "2026-06-10" }),
        pagamento({ status: "pago", pago_em: "2026-07-10" }),
        pagamento({ status: "pago", pago_em: "2026-05-10" }),
      ],
      HOJE
    );
    expect(resultado.ultimo_pagamento_em).toBe("2026-07-10");
  });
});
