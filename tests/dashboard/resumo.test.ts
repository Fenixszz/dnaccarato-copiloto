import { beforeEach, describe, expect, it, vi } from "vitest";
import { intervaloDaSemana, montarResumoDashboard } from "@/lib/dashboard/resumo";

describe("intervaloDaSemana", () => {
  it("no meio da semana, começa na segunda e vai até a segunda seguinte", () => {
    // 2026-07-22 é uma quarta-feira.
    const { inicio, fim } = intervaloDaSemana(new Date("2026-07-22T15:00:00.000Z"));
    expect(inicio).toBe("2026-07-20T00:00:00.000Z"); // segunda
    expect(fim).toBe("2026-07-27T00:00:00.000Z"); // segunda seguinte
  });

  it("na segunda, o início é o próprio dia", () => {
    const { inicio } = intervaloDaSemana(new Date("2026-07-20T09:00:00.000Z"));
    expect(inicio).toBe("2026-07-20T00:00:00.000Z");
  });

  it("no domingo, ainda pertence à semana que começou na segunda anterior", () => {
    // 2026-07-26 é domingo.
    const { inicio, fim } = intervaloDaSemana(new Date("2026-07-26T23:00:00.000Z"));
    expect(inicio).toBe("2026-07-20T00:00:00.000Z");
    expect(fim).toBe("2026-07-27T00:00:00.000Z");
  });
});

// Fake do Supabase para as queries do resumo: head/count nas 3 primeiras,
// linhas cruas na de pagamentos.
const { estado, criarSupabaseFalso } = vi.hoisted(() => {
  const estado: {
    alunas: number | null;
    documentos: number | null;
    reunioes: number | null;
    pagamentos: Array<{ status: string }>;
    erroEm: string | null;
  } = {
    alunas: 0,
    documentos: 0,
    reunioes: 0,
    pagamentos: [],
    erroEm: null,
  };

  function criarSupabaseFalso() {
    return {
      from: (tabela: string) => {
        const erro = estado.erroEm === tabela ? { message: "boom" } : null;
        const resultado =
          tabela === "alunas"
            ? { data: null, count: estado.alunas, error: erro }
            : tabela === "documentos"
              ? { data: null, count: estado.documentos, error: erro }
              : tabela === "reunioes"
                ? { data: null, count: estado.reunioes, error: erro }
                : { data: estado.pagamentos, count: null, error: erro };

        const consulta = {
          eq: () => consulta,
          gte: () => consulta,
          lt: () => consulta,
          neq: () => consulta,
          then: (resolver: (valor: typeof resultado) => unknown) =>
            Promise.resolve(resultado).then(resolver),
        };
        return { select: () => consulta };
      },
    };
  }

  return { estado, criarSupabaseFalso };
});

vi.mock("@/lib/db/supabase", () => ({ obterSupabase: criarSupabaseFalso }));

beforeEach(() => {
  estado.alunas = 5;
  estado.documentos = 3;
  estado.reunioes = 2;
  estado.pagamentos = [];
  estado.erroEm = null;
});

describe("montarResumoDashboard", () => {
  it("monta os totais a partir das contagens e conta só os pagamentos não pagos", () => {
    estado.pagamentos = [
      { status: "pendente" },
      { status: "OVERDUE" },
      { status: "pago" }, // vencido mas pago — não conta
      { status: "CONFIRMED" }, // pago (Asaas) — não conta
    ];

    return montarResumoDashboard(new Date("2026-07-22T12:00:00.000Z")).then((resumo) => {
      expect(resumo).toEqual({
        alunas: 5,
        documentosPendentes: 3,
        reunioesDaSemana: 2,
        pagamentosEmAtraso: 2,
      });
    });
  });

  it("count nulo vira zero", async () => {
    estado.alunas = null;
    estado.documentos = null;
    estado.reunioes = null;
    const resumo = await montarResumoDashboard(new Date("2026-07-22T12:00:00.000Z"));
    expect(resumo).toMatchObject({ alunas: 0, documentosPendentes: 0, reunioesDaSemana: 0 });
  });

  it("erro em qualquer query estoura com contexto", async () => {
    estado.erroEm = "documentos";
    await expect(montarResumoDashboard(new Date("2026-07-22T12:00:00.000Z"))).rejects.toThrow(
      /resumo do dashboard/
    );
  });
});
