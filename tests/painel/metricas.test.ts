import { describe, it, expect } from "vitest";
import { agregarPainel } from "@/lib/painel/metricas";

// Data fixa de referência: 19/08/2026 12:00 UTC (09:00 em São Paulo).
const AGORA = new Date("2026-08-19T12:00:00Z");

describe("agregarPainel", () => {
  it("conta alunas ativas e novas nos últimos 30 dias", () => {
    const m = agregarPainel(
      {
        alunas: [
          { criado_em: "2026-08-10T10:00:00Z" }, // dentro de 30d
          { criado_em: "2026-08-01T10:00:00Z" }, // dentro de 30d
          { criado_em: "2026-06-01T10:00:00Z" }, // fora
        ],
        pagamentos: [],
        documentos: [],
      },
      AGORA,
    );
    expect(m.alunasAtivas).toBe(3);
    expect(m.alunasNovas30d).toBe(2);
  });

  it("soma recebido do mês atual e do anterior e calcula a variação", () => {
    const m = agregarPainel(
      {
        alunas: [],
        pagamentos: [
          { status: "pago", valor: 100, pago_em: "2026-08-05T10:00:00Z" },
          { status: "pago", valor: 50, pago_em: "2026-08-18T10:00:00Z" },
          { status: "pago", valor: 100, pago_em: "2026-07-10T10:00:00Z" },
        ],
        documentos: [],
      },
      AGORA,
    );
    expect(m.recebidoMes).toBe(150);
    expect(m.recebidoMesAnterior).toBe(100);
    expect(m.variacaoRecebidoPct).toBe(50); // (150-100)/100
  });

  it("em aberto = atrasados + a vencer (pendentes); qtdAtrasados conta só os atrasados", () => {
    const m = agregarPainel(
      {
        alunas: [],
        pagamentos: [
          { status: "atrasado", valor: 200, pago_em: null },
          { status: "atrasado", valor: 80, pago_em: null },
          { status: "pendente", valor: 120, pago_em: null }, // emitida, a vencer
          { status: "pago", valor: 100, pago_em: "2026-08-01T10:00:00Z" },
        ],
        documentos: [],
      },
      AGORA,
    );
    expect(m.emAberto).toBe(400); // 200 + 80 + 120
    expect(m.qtdAtrasados).toBe(2); // só os atrasados
  });

  it("calcula a taxa de adimplência (pagas / (pagas + atrasadas))", () => {
    const m = agregarPainel(
      {
        alunas: [],
        pagamentos: [
          { status: "pago", valor: 100, pago_em: "2026-08-01T10:00:00Z" },
          { status: "pago", valor: 100, pago_em: "2026-08-01T10:00:00Z" },
          { status: "pago", valor: 100, pago_em: "2026-08-01T10:00:00Z" },
          { status: "atrasado", valor: 100, pago_em: null },
        ],
        documentos: [],
      },
      AGORA,
    );
    expect(m.taxaAdimplenciaPct).toBe(75); // 3 de 4
  });

  it("retorna null nas taxas quando não há dados suficientes", () => {
    const m = agregarPainel({ alunas: [], pagamentos: [], documentos: [] }, AGORA);
    expect(m.taxaAdimplenciaPct).toBeNull();
    expect(m.variacaoRecebidoPct).toBeNull();
  });

  it("monta 6 barras mensais terminando no mês atual e bucketiza os pagos", () => {
    const m = agregarPainel(
      {
        alunas: [],
        pagamentos: [
          { status: "pago", valor: 300, pago_em: "2026-08-05T10:00:00Z" },
          { status: "pago", valor: 100, pago_em: "2026-06-05T10:00:00Z" },
        ],
        documentos: [],
      },
      AGORA,
    );
    expect(m.recebimentoPorMes).toHaveLength(6);
    const ultima = m.recebimentoPorMes[5];
    expect(ultima).toMatchObject({ mes: 8, ano: 2026, rotulo: "ago", valor: 300 });
    expect(m.recebimentoPorMes[0]).toMatchObject({ mes: 3, ano: 2026 }); // ago-5 = mar
    const junho = m.recebimentoPorMes.find((b) => b.mes === 6);
    expect(junho?.valor).toBe(100);
  });

  it("conta documentos pendentes e rejeitados", () => {
    const m = agregarPainel(
      {
        alunas: [],
        pagamentos: [],
        documentos: [
          { status: "pendente" },
          { status: "pendente" },
          { status: "rejeitado" },
          { status: "assinado" },
        ],
      },
      AGORA,
    );
    expect(m.documentosPendentes).toBe(2);
    expect(m.documentosRejeitados).toBe(1);
  });
});
