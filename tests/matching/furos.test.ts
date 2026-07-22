import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIAS_SEM_FOLLOWUP_FORMULARIO,
  DIAS_TASK_PARADA,
  avaliarFuros,
  detectarFuros,
  type DadosParaFuros,
} from "@/lib/matching/furos";

const AGORA = new Date("2026-07-22T12:00:00.000Z");

function diasAtras(dias: number): string {
  return new Date(AGORA.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();
}

function semDados(): DadosParaFuros {
  return { pagamentos: [], documentos: [], formularios: [], reunioes: [], tasks_asana: [] };
}

describe("avaliarFuros — cada furo isolado", () => {
  it("pagamento não pago e vencido é furo de atraso, com valor e dias", () => {
    const furos = avaliarFuros(
      {
        ...semDados(),
        pagamentos: [{ status: "pendente", valor: 1200, vencimento: diasAtras(10).slice(0, 10) }],
      },
      AGORA
    );
    expect(furos).toEqual([
      expect.objectContaining({
        tipo: "pagamento_atrasado",
        detalhe: "pagamento de R$ 1200,00 vencido há 10 dias",
      }),
    ]);
  });

  it("pagamento pendente com vencimento futuro não é atraso", () => {
    const furos = avaliarFuros(
      {
        ...semDados(),
        pagamentos: [{ status: "pendente", valor: 1200, vencimento: diasAtras(-5).slice(0, 10) }],
      },
      AGORA
    );
    expect(furos).toEqual([]);
  });

  it("pagou mas não assinou contrato", () => {
    const furos = avaliarFuros(
      {
        ...semDados(),
        pagamentos: [{ status: "CONFIRMED", valor: 1200, vencimento: null }],
        documentos: [{ tipo: "Contrato", status: "pendente" }],
      },
      AGORA
    );
    expect(furos).toEqual([expect.objectContaining({ tipo: "pagou_sem_contrato_assinado" })]);
  });

  it("contrato assinado zera o furo de pagamento sem contrato", () => {
    const furos = avaliarFuros(
      {
        ...semDados(),
        pagamentos: [{ status: "pago", valor: 1200, vencimento: null }],
        documentos: [{ tipo: "Contrato", status: "assinado" }],
        reunioes: [{ status: "agendada", data_hora: diasAtras(-2) }],
      },
      AGORA
    );
    expect(furos).toEqual([]);
  });

  it("pagamento pendente não dispara furo de contrato", () => {
    const furos = avaliarFuros(
      { ...semDados(), pagamentos: [{ status: "pendente", valor: 1200, vencimento: null }] },
      AGORA
    );
    expect(furos).toEqual([]);
  });

  it("assinou documento mas não tem reunião marcada", () => {
    const furos = avaliarFuros(
      { ...semDados(), documentos: [{ tipo: "Termo de Imagem", status: "assinado" }] },
      AGORA
    );
    expect(furos).toEqual([expect.objectContaining({ tipo: "assinou_sem_reuniao" })]);
  });

  it("reunião cancelada não conta como reunião marcada", () => {
    const furos = avaliarFuros(
      {
        ...semDados(),
        documentos: [{ tipo: "Contrato", status: "assinado" }],
        reunioes: [{ status: "cancelada", data_hora: diasAtras(-1) }],
      },
      AGORA
    );
    expect(furos).toEqual([expect.objectContaining({ tipo: "assinou_sem_reuniao" })]);
  });

  it("formulário respondido além da janela e sem follow-up", () => {
    const furos = avaliarFuros(
      {
        ...semDados(),
        formularios: [
          {
            formulario_nome: "Anamnese",
            respondido_em: diasAtras(DIAS_SEM_FOLLOWUP_FORMULARIO + 2),
          },
        ],
      },
      AGORA
    );
    expect(furos).toEqual([
      expect.objectContaining({
        tipo: "formulario_sem_followup",
        detalhe: expect.stringContaining("Anamnese"),
      }),
    ]);
  });

  it("formulário dentro da janela não dispara furo", () => {
    const furos = avaliarFuros(
      {
        ...semDados(),
        formularios: [
          {
            formulario_nome: "Anamnese",
            respondido_em: diasAtras(DIAS_SEM_FOLLOWUP_FORMULARIO - 1),
          },
        ],
      },
      AGORA
    );
    expect(furos).toEqual([]);
  });

  it("reunião marcada depois da resposta conta como follow-up", () => {
    const respondidoHa = DIAS_SEM_FOLLOWUP_FORMULARIO + 3;
    const furos = avaliarFuros(
      {
        ...semDados(),
        formularios: [{ formulario_nome: "Anamnese", respondido_em: diasAtras(respondidoHa) }],
        reunioes: [{ status: "agendada", data_hora: diasAtras(respondidoHa - 1) }],
      },
      AGORA
    );
    expect(furos).toEqual([]);
  });

  it("task criada depois da resposta conta como follow-up", () => {
    const respondidoHa = DIAS_SEM_FOLLOWUP_FORMULARIO + 3;
    const furos = avaliarFuros(
      {
        ...semDados(),
        formularios: [{ formulario_nome: "Anamnese", respondido_em: diasAtras(respondidoHa) }],
        tasks_asana: [
          {
            titulo: "Ligar pra aluna",
            criado_em: diasAtras(respondidoHa - 1),
            concluido_em: diasAtras(1),
          },
        ],
      },
      AGORA
    );
    expect(furos).toEqual([]);
  });

  it("task do Asana parada além da janela", () => {
    const furos = avaliarFuros(
      {
        ...semDados(),
        tasks_asana: [
          {
            titulo: "Montar protocolo",
            criado_em: diasAtras(DIAS_TASK_PARADA + 5),
            concluido_em: null,
          },
        ],
      },
      AGORA
    );
    expect(furos).toEqual([
      expect.objectContaining({
        tipo: "task_parada",
        detalhe: expect.stringContaining("Montar protocolo"),
      }),
    ]);
  });

  it("task recém-aberta ou concluída não dispara furo", () => {
    const furos = avaliarFuros(
      {
        ...semDados(),
        tasks_asana: [
          { titulo: "Nova", criado_em: diasAtras(2), concluido_em: null },
          { titulo: "Antiga concluída", criado_em: diasAtras(40), concluido_em: diasAtras(30) },
        ],
      },
      AGORA
    );
    expect(furos).toEqual([]);
  });
});

describe("avaliarFuros — cenários combinados", () => {
  it("aluna em dia com tudo: nenhum furo", () => {
    const furos = avaliarFuros(
      {
        pagamentos: [{ status: "pago", valor: 1200, vencimento: null }],
        documentos: [{ tipo: "Contrato", status: "assinado" }],
        formularios: [{ formulario_nome: "Anamnese", respondido_em: diasAtras(1) }],
        reunioes: [{ status: "confirmada", data_hora: diasAtras(-2) }],
        tasks_asana: [{ titulo: "Plano", criado_em: diasAtras(3), concluido_em: diasAtras(1) }],
      },
      AGORA
    );
    expect(furos).toEqual([]);
  });

  it("vários furos ao mesmo tempo aparecem todos", () => {
    const furos = avaliarFuros(
      {
        pagamentos: [{ status: "RECEIVED", valor: 1200, vencimento: null }],
        documentos: [{ tipo: "Termo", status: "assinado" }],
        formularios: [
          {
            formulario_nome: "Anamnese",
            respondido_em: diasAtras(DIAS_SEM_FOLLOWUP_FORMULARIO + 10),
          },
        ],
        reunioes: [],
        tasks_asana: [
          {
            titulo: "Parada",
            criado_em: diasAtras(DIAS_SEM_FOLLOWUP_FORMULARIO + 20),
            concluido_em: null,
          },
        ],
      },
      AGORA
    );
    const tipos = furos.map((furo) => furo.tipo);
    // A task parada foi criada ANTES da resposta do formulário, então não
    // conta como follow-up — os quatro furos disparam juntos.
    expect(tipos).toEqual([
      "pagou_sem_contrato_assinado",
      "assinou_sem_reuniao",
      "formulario_sem_followup",
      "task_parada",
    ]);
  });
});

const { estado, criarSupabaseFalso } = vi.hoisted(() => {
  const estado: { resposta: { data: unknown; error: { message: string } | null } } = {
    resposta: { data: null, error: null },
  };
  function criarSupabaseFalso() {
    const consulta = {
      eq: () => consulta,
      maybeSingle: () => Promise.resolve(estado.resposta),
    };
    return { from: () => ({ select: () => consulta }) };
  }
  return { estado, criarSupabaseFalso };
});

vi.mock("@/lib/db/supabase", () => ({ obterSupabase: criarSupabaseFalso }));

describe("detectarFuros (camada de banco)", () => {
  beforeEach(() => {
    estado.resposta = { data: null, error: null };
  });

  it("avalia os furos com os dados vindos do banco", async () => {
    estado.resposta = {
      data: {
        id: "aluna_1",
        pagamentos: [{ status: "pago", valor: 1200, vencimento: null }],
        documentos: [],
        formularios: [],
        reunioes: [],
        tasks_asana: [],
      },
      error: null,
    };
    const furos = await detectarFuros("aluna_1");
    expect(furos).toEqual([expect.objectContaining({ tipo: "pagou_sem_contrato_assinado" })]);
  });

  it("aluna inexistente lança erro claro", async () => {
    await expect(detectarFuros("aluna_fantasma")).rejects.toThrow("não encontrada");
  });

  it("erro do banco lança erro com contexto", async () => {
    estado.resposta = { data: null, error: { message: "timeout" } };
    await expect(detectarFuros("aluna_1")).rejects.toThrow("detectar furos");
  });
});
