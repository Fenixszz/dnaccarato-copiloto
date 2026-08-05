import { describe, it, expect } from "vitest";
import { avaliarFuros, type DadosAlunaFuros } from "@/lib/matching/furos";

const AGORA = new Date("2026-08-05T00:00:00.000Z");

// Datas de referência relativas a AGORA.
const RECENTE = "2026-08-03T00:00:00Z"; // 2 dias atrás (< X)
const ANTIGO = "2026-07-25T00:00:00Z"; // 11 dias atrás (> X)
const REUNIAO_FUTURA = "2026-08-10T10:00:00Z";
const TASK_ANTIGA = "2026-07-20T00:00:00Z"; // 16 dias atrás (> N)

/** Base sem nenhum furo. Cada teste parte daqui e muda só o necessário. */
function semFuro(): DadosAlunaFuros {
  return {
    documentos: [{ status: "assinado", tipo: "contrato", motivo_rejeicao: null }],
    pagamentos: [{ status: "pago", valor: 500 }],
    reunioes: [{ status: "agendada", data_hora: REUNIAO_FUTURA }],
    formularios: [{ formulario_nome: "Onboarding", respondido_em: RECENTE }],
    tasks_asana: [
      {
        titulo: "Boas-vindas",
        status: "concluida",
        criado_em: "2026-07-01T00:00:00Z",
        concluido_em: "2026-07-02T00:00:00Z",
      },
    ],
  };
}

const tipos = (dados: DadosAlunaFuros) => avaliarFuros(dados, AGORA).map((f) => f.tipo);

describe("avaliarFuros", () => {
  it("aluna em dia: nenhum furo", () => {
    expect(avaliarFuros(semFuro(), AGORA)).toEqual([]);
  });

  it("assinatura rejeitada (crítica, com motivo)", () => {
    const furos = avaliarFuros(
      {
        ...semFuro(),
        documentos: [
          { status: "rejeitado", tipo: "contrato", motivo_rejeicao: "Dados divergentes" },
        ],
        pagamentos: [{ status: "pendente", valor: 500 }],
        reunioes: [],
      },
      AGORA,
    );
    expect(furos).toHaveLength(1);
    expect(furos[0]?.tipo).toBe("assinatura_rejeitada");
    expect(furos[0]?.severidade).toBe("critica");
    expect(furos[0]?.mensagem).toContain("Dados divergentes");
  });

  it("pagou mas não assinou contrato", () => {
    expect(
      tipos({
        ...semFuro(),
        documentos: [],
        reunioes: [],
        pagamentos: [{ status: "pago", valor: 500 }],
      }),
    ).toEqual(["pagou_sem_contrato"]);
  });

  it("assinou mas não tem reunião marcada", () => {
    expect(
      tipos({
        ...semFuro(),
        documentos: [{ status: "assinado", tipo: "contrato", motivo_rejeicao: null }],
        reunioes: [],
      }),
    ).toEqual(["assinou_sem_reuniao"]);
  });

  it("formulário respondido há mais de X dias sem follow-up", () => {
    expect(
      tipos({
        documentos: [],
        pagamentos: [],
        reunioes: [],
        formularios: [{ formulario_nome: "Onboarding", respondido_em: ANTIGO }],
        tasks_asana: [],
      }),
    ).toEqual(["formulario_sem_followup"]);
  });

  it("formulário antigo MAS com reunião de follow-up depois: sem furo", () => {
    expect(
      tipos({
        documentos: [],
        pagamentos: [],
        reunioes: [{ status: "agendada", data_hora: REUNIAO_FUTURA }],
        formularios: [{ formulario_nome: "Onboarding", respondido_em: ANTIGO }],
        tasks_asana: [],
      }),
    ).toEqual([]);
  });

  it("task do Asana parada há mais de N dias", () => {
    expect(
      tipos({
        documentos: [],
        pagamentos: [],
        reunioes: [],
        formularios: [],
        tasks_asana: [
          {
            titulo: "Enviar material",
            status: "em_andamento",
            criado_em: TASK_ANTIGA,
            concluido_em: null,
          },
        ],
      }),
    ).toEqual(["task_parada"]);
  });

  it("task recente aberta: sem furo", () => {
    expect(
      tipos({
        documentos: [],
        pagamentos: [],
        reunioes: [],
        formularios: [],
        tasks_asana: [
          {
            titulo: "Nova",
            status: "em_andamento",
            criado_em: RECENTE,
            concluido_em: null,
          },
        ],
      }),
    ).toEqual([]);
  });

  it("rejeição é o furo mais urgente (aparece primeiro)", () => {
    const furos = avaliarFuros(
      {
        documentos: [
          {
            status: "rejeitado",
            tipo: "contrato",
            motivo_rejeicao: "Assinatura recusada",
          },
        ],
        pagamentos: [],
        reunioes: [],
        formularios: [],
        tasks_asana: [
          {
            titulo: "Task velha",
            status: "em_andamento",
            criado_em: TASK_ANTIGA,
            concluido_em: null,
          },
        ],
      },
      AGORA,
    );
    expect(furos.map((f) => f.tipo)).toEqual(["assinatura_rejeitada", "task_parada"]);
    expect(furos[0]?.severidade).toBe("critica");
  });

  it("dados relacionados ausentes (null): não quebra, retorna vazio", () => {
    expect(avaliarFuros({}, AGORA)).toEqual([]);
  });
});
