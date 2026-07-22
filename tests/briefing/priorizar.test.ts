import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAXIMO_DE_ITENS_NO_BRIEFING,
  coletarFurosDeTodasAsAlunas,
  montarMensagemDeBriefing,
  priorizarFuros,
  type FuroDeAluna,
} from "@/lib/briefing/priorizar";

function furo(
  tipo: FuroDeAluna["tipo"],
  nome: string,
  detalhe = `detalhe de ${tipo}`
): FuroDeAluna {
  return { tipo, detalhe, aluna_id: `id_${nome}`, aluna_nome: nome };
}

describe("priorizarFuros", () => {
  it("ordena pela heurística: pagamento > documento > reunião > follow-up > task", () => {
    const furos = [
      furo("task_parada", "Elisa"),
      furo("formulario_sem_followup", "Daniela"),
      furo("assinou_sem_reuniao", "Carla"),
      furo("pagou_sem_contrato_assinado", "Fernanda"),
      furo("pagamento_atrasado", "Beatriz"),
    ];
    const itens = priorizarFuros(furos);
    expect(itens.map((item) => item.tipo)).toEqual([
      "pagamento_atrasado",
      "pagou_sem_contrato_assinado",
      "assinou_sem_reuniao",
    ]);
  });

  it("com mais de 3 furos, corta em exatamente 3 mantendo os mais urgentes", () => {
    const furos = [
      furo("task_parada", "Elisa"),
      furo("task_parada", "Gabriela"),
      furo("pagamento_atrasado", "Beatriz"),
      furo("assinou_sem_reuniao", "Carla"),
      furo("pagamento_atrasado", "Helena"),
    ];
    const itens = priorizarFuros(furos);
    expect(itens).toHaveLength(MAXIMO_DE_ITENS_NO_BRIEFING);
    expect(itens.map((item) => item.aluna_nome)).toEqual(["Beatriz", "Helena", "Carla"]);
  });

  it("empate no tipo mantém a ordem de chegada (sort estável)", () => {
    const furos = [furo("pagamento_atrasado", "Primeira"), furo("pagamento_atrasado", "Segunda")];
    expect(priorizarFuros(furos).map((item) => item.aluna_nome)).toEqual(["Primeira", "Segunda"]);
  });
});

describe("montarMensagemDeBriefing", () => {
  it("zero furos: mensagem de tudo em dia, sem lista vazia estranha", () => {
    const mensagem = montarMensagemDeBriefing([]);
    expect(mensagem).toBe("Bom dia, Adriana! Tudo em dia por aqui: nenhuma pendência hoje. ☀️");
    expect(mensagem).not.toContain("0 coisas");
    expect(mensagem).not.toContain("1.");
  });

  it("um furo só usa o singular", () => {
    const mensagem = montarMensagemDeBriefing([
      furo("pagamento_atrasado", "Beatriz Lima", "pagamento de R$ 1200,00 vencido há 10 dias"),
    ]);
    expect(mensagem).toContain("Bom dia, Adriana. 1 coisa hoje:");
    expect(mensagem).toContain("1. Beatriz Lima: pagamento de R$ 1200,00 vencido há 10 dias");
  });

  it("com 5 furos: cabeçalho com o total, 3 itens numerados e rodapé com o resto", () => {
    const mensagem = montarMensagemDeBriefing([
      furo("task_parada", "Elisa", "task aberta há 12 dias"),
      furo("formulario_sem_followup", "Daniela", "formulário sem follow-up há 7 dias"),
      furo("pagamento_atrasado", "Beatriz", "pagamento vencido há 10 dias"),
      furo("assinou_sem_reuniao", "Carla", "assinou sem reunião marcada"),
      furo("pagamento_atrasado", "Helena", "pagamento vencido há 3 dias"),
    ]);

    expect(mensagem).toContain("Bom dia, Adriana. 5 coisas hoje:");
    expect(mensagem).toContain("1. Beatriz: pagamento vencido há 10 dias");
    expect(mensagem).toContain("2. Helena: pagamento vencido há 3 dias");
    expect(mensagem).toContain("3. Carla: assinou sem reunião marcada");
    // Corta certo: nada de item 4, e o resto vira rodapé.
    expect(mensagem).not.toContain("4.");
    expect(mensagem).not.toContain("Elisa");
    expect(mensagem).toContain("(+2 pendências menos urgentes fora da lista)");
  });

  it("com exatamente 3 furos não tem rodapé de restantes", () => {
    const mensagem = montarMensagemDeBriefing([
      furo("pagamento_atrasado", "Beatriz"),
      furo("assinou_sem_reuniao", "Carla"),
      furo("task_parada", "Elisa"),
    ]);
    expect(mensagem).toContain("3 coisas hoje:");
    expect(mensagem).not.toContain("fora da lista");
  });
});

// Coletor: uma query só com embeds; avaliarFuros roda por aluna.
const { estado, criarSupabaseFalso } = vi.hoisted(() => {
  const estado: { alunas: Array<Record<string, unknown>> } = { alunas: [] };
  function criarSupabaseFalso() {
    const consulta = {
      order: () => Promise.resolve({ data: estado.alunas, error: null }),
    };
    return { from: () => ({ select: () => consulta }) };
  }
  return { estado, criarSupabaseFalso };
});

vi.mock("@/lib/db/supabase", () => ({ obterSupabase: criarSupabaseFalso }));

describe("coletarFurosDeTodasAsAlunas", () => {
  beforeEach(() => {
    estado.alunas = [];
  });

  it("junta os furos de todas as alunas com nome e id", async () => {
    const dezDiasAtras = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    estado.alunas = [
      {
        id: "aluna_bia",
        nome: "Beatriz Lima",
        pagamentos: [{ status: "pendente", valor: 1200, vencimento: dezDiasAtras }],
        documentos: [],
        formularios: [],
        reunioes: [],
        tasks_asana: [],
      },
      {
        id: "aluna_ana",
        nome: "Ana Paula Ribeiro",
        pagamentos: [{ status: "pago", valor: 1200, vencimento: dezDiasAtras }],
        documentos: [{ tipo: "contrato", status: "assinado" }],
        formularios: [],
        reunioes: [
          {
            status: "confirmada",
            data_hora: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
        tasks_asana: [],
      },
    ];

    const furos = await coletarFurosDeTodasAsAlunas();

    expect(furos).toEqual([
      expect.objectContaining({
        tipo: "pagamento_atrasado",
        aluna_id: "aluna_bia",
        aluna_nome: "Beatriz Lima",
      }),
    ]);
  });
});
