import { describe, it, expect } from "vitest";
import { montarDossie, type DossieRow } from "@/lib/dossie";

const AGORA = new Date("2026-08-05T00:00:00.000Z");

function rowCompleta(): DossieRow {
  return {
    id: "aluna-1",
    nome: "Ana Prado",
    email: "ana@ex.com",
    telefone: "11999998888",
    criado_em: "2026-01-01T00:00:00Z",
    metadata: { seed: true },
    pagamentos: [
      {
        id: "p1",
        origem: "asaas",
        status: "atrasado",
        valor: 500,
        vencimento: "2026-07-01",
        pago_em: null,
        referencia_externa: "r1",
      },
      {
        id: "p2",
        origem: "asaas",
        status: "pago",
        valor: 500,
        vencimento: "2026-06-01",
        pago_em: "2026-06-01",
        referencia_externa: "r2",
      },
      {
        id: "p3",
        origem: "asaas",
        status: "pendente",
        valor: 300,
        vencimento: "2026-08-10",
        pago_em: null,
        referencia_externa: "r3",
      },
    ],
    documentos: [
      {
        id: "d1",
        tipo: "contrato",
        status: "pendente",
        origem: "autentique",
        assinado_em: null,
        motivo_rejeicao: null,
        link_assinado: null,
      },
      {
        id: "d2",
        tipo: "contrato",
        status: "assinado",
        origem: "autentique",
        assinado_em: "2026-07-10T00:00:00Z",
        motivo_rejeicao: null,
        link_assinado: "https://signed",
      },
      {
        id: "d3",
        tipo: "contrato",
        status: "rejeitado",
        origem: "autentique",
        assinado_em: null,
        motivo_rejeicao: "Dados divergentes",
        link_assinado: null,
      },
    ],
    materiais: Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      nome_arquivo: `arquivo-${i}.pdf`,
      tipo: "application/pdf",
      link_drive: null,
      adicionado_em: `2026-07-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    })),
    formularios: Array.from({ length: 6 }, (_, i) => ({
      id: `fo${i}`,
      formulario_nome: "Onboarding",
      respostas: { i },
      respondido_em: `2026-07-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    })),
    reunioes: [
      {
        id: "r-passada",
        origem: "calendly",
        data_hora: "2026-08-01T10:00:00Z",
        status: "agendada",
        link: null,
      },
      {
        id: "r-futura",
        origem: "calendly",
        data_hora: "2026-08-10T10:00:00Z",
        status: "agendada",
        link: "https://z",
      },
      {
        id: "r-cancelada",
        origem: "calendly",
        data_hora: "2026-08-08T10:00:00Z",
        status: "cancelada",
        link: null,
      },
    ],
    tasks_asana: [
      {
        id: "t1",
        task_id: "a",
        titulo: "concluída",
        status: "concluida",
        criado_em: null,
        concluido_em: "2026-07-01T00:00:00Z",
      },
      {
        id: "t2",
        task_id: "b",
        titulo: "em andamento",
        status: "em_andamento",
        criado_em: null,
        concluido_em: null,
      },
      {
        id: "t3",
        task_id: "c",
        titulo: "removida",
        status: "removida",
        criado_em: null,
        concluido_em: null,
      },
      {
        id: "t4",
        task_id: "d",
        titulo: "sem status",
        status: null,
        criado_em: null,
        concluido_em: null,
      },
    ],
  };
}

describe("montarDossie", () => {
  it("resume pagamentos (status, em atraso, valor em aberto)", () => {
    const d = montarDossie(rowCompleta(), AGORA);
    expect(d.pagamentos.resumo.total).toBe(3);
    expect(d.pagamentos.resumo.por_status).toEqual({ atrasado: 1, pago: 1, pendente: 1 });
    expect(d.pagamentos.resumo.em_atraso).toBe(true);
    expect(d.pagamentos.resumo.valor_em_aberto).toBe(800); // 500 atrasado + 300 pendente
    expect(d.pagamentos.itens).toHaveLength(3);
  });

  it("separa documentos por status", () => {
    const d = montarDossie(rowCompleta(), AGORA);
    expect(d.documentos.pendentes.map((x) => x.id)).toEqual(["d1"]);
    expect(d.documentos.assinados.map((x) => x.id)).toEqual(["d2"]);
    expect(d.documentos.rejeitados.map((x) => x.id)).toEqual(["d3"]);
  });

  it("materiais recentes: no máximo 10, do mais novo para o mais antigo", () => {
    const d = montarDossie(rowCompleta(), AGORA);
    expect(d.materiais_recentes).toHaveLength(10);
    expect(d.materiais_recentes[0]?.id).toBe("m11"); // 2026-07-12, o mais novo
    expect(d.materiais_recentes.map((m) => m.id)).not.toContain("m0"); // os 2 mais antigos ficam de fora
  });

  it("últimas respostas de formulário: no máximo 5, mais recentes primeiro", () => {
    const d = montarDossie(rowCompleta(), AGORA);
    expect(d.ultimas_respostas_formulario).toHaveLength(5);
    expect(d.ultimas_respostas_formulario[0]?.id).toBe("fo5");
  });

  it("próxima reunião: a agendada mais próxima no futuro (ignora passada e cancelada)", () => {
    const d = montarDossie(rowCompleta(), AGORA);
    expect(d.proxima_reuniao?.id).toBe("r-futura");
  });

  it("tasks abertas: exclui concluídas e removidas", () => {
    const d = montarDossie(rowCompleta(), AGORA);
    expect(d.tasks_abertas.map((t) => t.id).sort()).toEqual(["t2", "t4"]);
  });

  it("aluna sem dados relacionados: tudo vazio, próxima reunião null, sem erro", () => {
    const row: DossieRow = {
      id: "aluna-2",
      nome: "Bruna Lima",
      email: null,
      telefone: null,
      criado_em: "2026-02-01T00:00:00Z",
      metadata: {},
    };
    const d = montarDossie(row, AGORA);
    expect(d.pagamentos.itens).toEqual([]);
    expect(d.pagamentos.resumo).toEqual({
      total: 0,
      por_status: {},
      em_atraso: false,
      valor_em_aberto: 0,
    });
    expect(d.documentos.pendentes).toEqual([]);
    expect(d.materiais_recentes).toEqual([]);
    expect(d.ultimas_respostas_formulario).toEqual([]);
    expect(d.proxima_reuniao).toBeNull();
    expect(d.tasks_abertas).toEqual([]);
    expect(d.aluna).toMatchObject({ id: "aluna-2", nome: "Bruna Lima" });
  });
});
