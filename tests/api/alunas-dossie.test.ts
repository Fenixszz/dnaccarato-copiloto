import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/alunas/[id]/dossie/route";

// Fake do builder de query do Supabase: os modificadores encadeiam e
// maybeSingle resolve com o que o teste preparou em `respostaDaQuery`.
const { estado, criarSupabaseFalso } = vi.hoisted(() => {
  const estado: {
    respostaDaQuery: { data: unknown; error: { message: string } | null };
    selectRecebido: string | null;
  } = {
    respostaDaQuery: { data: null, error: null },
    selectRecebido: null,
  };

  function criarSupabaseFalso() {
    const consulta = {
      eq: () => consulta,
      gte: () => consulta,
      neq: () => consulta,
      is: () => consulta,
      order: () => consulta,
      limit: () => consulta,
      maybeSingle: () => Promise.resolve(estado.respostaDaQuery),
    };
    return {
      from: (tabela: string) => {
        if (tabela !== "alunas") {
          throw new Error(`Tabela inesperada no teste: ${tabela}`);
        }
        return {
          select: (colunas: string) => {
            estado.selectRecebido = colunas;
            return consulta;
          },
        };
      },
    };
  }

  return { estado, criarSupabaseFalso };
});

vi.mock("@/lib/db/supabase", () => ({ obterSupabase: criarSupabaseFalso }));

const ALUNA_ID = "3f1c4a68-9a1b-4f4e-8a2e-5b6c7d8e9f10";

function chamar(id: string = ALUNA_ID) {
  return GET(new Request(`http://localhost/api/alunas/${id}/dossie`), {
    params: Promise.resolve({ id }),
  });
}

const dossieCompleto = {
  id: ALUNA_ID,
  nome: "Beatriz Lima",
  email: "beatriz@example.com",
  telefone: "11922220002",
  criado_em: "2026-07-01T10:00:00.000Z",
  pagamentos: [
    { id: "pag_1", status: "pendente", valor: 1200, vencimento: "2026-07-12", pago_em: null },
    { id: "pag_2", status: "pago", valor: 1200, vencimento: "2026-06-12", pago_em: "2026-06-12" },
  ],
  documentos: [
    {
      id: "doc_1",
      tipo: "Contrato",
      status: "assinado",
      assinado_em: "2026-07-02T09:00:00.000Z",
      link_drive: "https://drive.google.com/x",
    },
    {
      id: "doc_2",
      tipo: "Termo de Imagem",
      status: "pendente",
      assinado_em: null,
      link_drive: null,
    },
  ],
  formularios: [
    {
      id: "form_1",
      formulario_nome: "Anamnese",
      respostas: [{ pergunta: "Objetivo", resposta: "Emagrecimento" }],
      respondido_em: "2026-07-15T08:00:00.000Z",
    },
  ],
  reunioes: [
    {
      id: "reu_1",
      origem: "calendly",
      data_hora: "2026-07-25T13:00:00.000Z",
      status: "agendada",
      link: "https://meet.google.com/abc",
    },
  ],
  tasks_asana: [
    {
      id: "task_1",
      task_id: "gid_123",
      titulo: "Montar protocolo",
      status: "em_andamento",
      criado_em: "2026-07-10T10:00:00.000Z",
    },
  ],
};

beforeEach(() => {
  estado.respostaDaQuery = { data: null, error: null };
  estado.selectRecebido = null;
});

describe("GET /api/alunas/[id]/dossie", () => {
  it("agrega tudo numa resposta só, com resumo de pagamentos calculado", async () => {
    estado.respostaDaQuery = { data: dossieCompleto, error: null };

    const resposta = await chamar();
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as Record<string, unknown>;

    expect(corpo.aluna).toMatchObject({ id: ALUNA_ID, nome: "Beatriz Lima" });
    expect(corpo.pagamentos).toMatchObject({
      situacao: "atrasado",
      quantidade_em_atraso: 1,
      total_em_atraso: 1200,
      ultimo_pagamento_em: "2026-06-12",
    });
    expect(corpo.documentos).toMatchObject({
      assinados: [{ id: "doc_1" }],
      pendentes: [{ id: "doc_2" }],
    });
    expect(corpo.formularios).toHaveLength(1);
    expect(corpo.proxima_reuniao).toMatchObject({ id: "reu_1", status: "agendada" });
    expect(corpo.tasks_abertas).toEqual([expect.objectContaining({ task_id: "gid_123" })]);
  });

  it("é uma única query: todos os relacionamentos vão no mesmo select", async () => {
    estado.respostaDaQuery = { data: dossieCompleto, error: null };

    await chamar();

    expect(estado.selectRecebido).toContain("pagamentos");
    expect(estado.selectRecebido).toContain("documentos");
    expect(estado.selectRecebido).toContain("formularios");
    expect(estado.selectRecebido).toContain("reunioes");
    expect(estado.selectRecebido).toContain("tasks_asana");
  });

  it("aluna sem dados relacionados: listas vazias e nulls, nunca erro", async () => {
    estado.respostaDaQuery = {
      data: {
        ...dossieCompleto,
        pagamentos: [],
        documentos: [],
        formularios: [],
        reunioes: [],
        tasks_asana: [],
      },
      error: null,
    };

    const resposta = await chamar();
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as Record<string, unknown>;

    expect(corpo.pagamentos).toMatchObject({ situacao: "sem_registros", recentes: [] });
    expect(corpo.documentos).toEqual({ assinados: [], pendentes: [] });
    expect(corpo.formularios).toEqual([]);
    expect(corpo.proxima_reuniao).toBeNull();
    expect(corpo.tasks_abertas).toEqual([]);
  });

  it("aluna inexistente responde 404", async () => {
    estado.respostaDaQuery = { data: null, error: null };
    const resposta = await chamar();
    expect(resposta.status).toBe(404);
  });

  it("id que não é UUID responde 400 sem consultar o banco", async () => {
    const resposta = await chamar("nao-e-uuid");
    expect(resposta.status).toBe(400);
    expect(estado.selectRecebido).toBeNull();
  });

  it("erro do banco responde 500 com mensagem genérica", async () => {
    estado.respostaDaQuery = { data: null, error: { message: "connection refused" } };
    const resposta = await chamar();
    expect(resposta.status).toBe(500);
    const corpo = (await resposta.json()) as { erro: string };
    expect(corpo.erro).not.toContain("connection");
  });
});
