import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcp/route";

const TOKEN = "mcp_token_de_teste_tools";
const TOKEN_HASH = createHash("sha256").update(TOKEN).digest("hex");

// Fake em memória cobrindo as tabelas usadas pelas tools de leitura.
const { estado, criarSupabaseFalso } = vi.hoisted(() => {
  const estado: {
    tokens: Map<string, Record<string, unknown>>;
    alunas: Array<Record<string, unknown>>;
    dossieData: unknown;
    pagamentos: Array<Record<string, unknown>>;
    documentos: Array<Record<string, unknown>>;
    reunioes: Array<Record<string, unknown>>;
    formularios: Array<Record<string, unknown>>;
  } = {
    tokens: new Map(),
    alunas: [],
    dossieData: null,
    pagamentos: [],
    documentos: [],
    reunioes: [],
    formularios: [],
  };

  function construtorDeLista(linhas: () => Array<Record<string, unknown>>) {
    const consulta = {
      eq: () => consulta,
      lt: () => consulta,
      gte: () => consulta,
      neq: () => consulta,
      is: () => consulta,
      order: () => consulta,
      limit: () => consulta,
      maybeSingle: () => Promise.resolve({ data: estado.dossieData, error: null }),
      then: (
        cumprir: (valor: { data: unknown; error: null }) => unknown,
        rejeitar?: (motivo: unknown) => unknown
      ) => Promise.resolve({ data: linhas(), error: null }).then(cumprir, rejeitar),
    };
    return { select: () => consulta };
  }

  function criarSupabaseFalso() {
    return {
      from: (tabela: string) => {
        if (tabela === "api_tokens") {
          return {
            select: () => ({
              eq: (_coluna: string, hash: string) => ({
                maybeSingle: () =>
                  Promise.resolve({ data: estado.tokens.get(hash) ?? null, error: null }),
              }),
            }),
          };
        }
        if (tabela === "alunas") return construtorDeLista(() => estado.alunas);
        if (tabela === "pagamentos") return construtorDeLista(() => estado.pagamentos);
        if (tabela === "documentos") return construtorDeLista(() => estado.documentos);
        if (tabela === "reunioes") return construtorDeLista(() => estado.reunioes);
        if (tabela === "formularios") return construtorDeLista(() => estado.formularios);
        throw new Error(`Tabela inesperada no teste: ${tabela}`);
      },
    };
  }

  return { estado, criarSupabaseFalso };
});

vi.mock("@/lib/db/supabase", () => ({ obterSupabase: criarSupabaseFalso }));

function requisicaoTool(nome: string, argumentos: Record<string, unknown>): Request {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: nome, arguments: argumentos },
    }),
  });
}

type RespostaTool = { result: { content: Array<{ text: string }>; isError?: boolean } };

async function chamarTool(nome: string, argumentos: Record<string, unknown> = {}) {
  const resposta = await POST(requisicaoTool(nome, argumentos));
  const corpo = (await resposta.json()) as RespostaTool;
  return corpo.result;
}

beforeEach(() => {
  estado.tokens.clear();
  estado.tokens.set(TOKEN_HASH, {
    id: "token_1",
    nome: "token-de-teste",
    escopo: [
      "status_aluna",
      "pagamentos_pendentes",
      "documentos_nao_assinados",
      "proxima_reuniao",
      "buscar_formulario",
    ],
    status: "ativo",
  });
  estado.alunas = [
    { id: "aluna_ana", nome: "Ana Paula Ribeiro" },
    { id: "aluna_bia", nome: "Beatriz Lima" },
    { id: "aluna_mendes", nome: "Ana Paula Mendes" },
  ];
  estado.dossieData = null;
  estado.pagamentos = [];
  estado.documentos = [];
  estado.reunioes = [];
  estado.formularios = [];
});

describe("status_aluna", () => {
  it("acha a aluna por parte do nome e devolve o dossiê", async () => {
    estado.dossieData = {
      id: "aluna_bia",
      nome: "Beatriz Lima",
      email: null,
      telefone: null,
      criado_em: "2026-07-01T10:00:00.000Z",
      pagamentos: [],
      documentos: [],
      formularios: [],
      reunioes: [],
      tasks_asana: [],
    };
    const resultado = await chamarTool("status_aluna", { nome: "beatriz" });
    expect(resultado.isError).toBeUndefined();
    const dossie = JSON.parse(resultado.content[0].text) as Record<string, unknown>;
    expect(dossie.aluna).toMatchObject({ nome: "Beatriz Lima" });
  });

  it("nome ambíguo lista as candidatas sem chutar", async () => {
    const resultado = await chamarTool("status_aluna", { nome: "Ana Paula" });
    expect(resultado.isError).toBe(true);
    expect(resultado.content[0].text).toContain("Ana Paula Ribeiro");
    expect(resultado.content[0].text).toContain("Ana Paula Mendes");
  });

  it("aluna inexistente tem mensagem clara", async () => {
    const resultado = await chamarTool("status_aluna", { nome: "Zoe Martins" });
    expect(resultado.isError).toBe(true);
    expect(resultado.content[0].text).toContain(
      'Nenhuma aluna encontrada com o nome "Zoe Martins"'
    );
  });
});

describe("pagamentos_pendentes", () => {
  it("agrupa por aluna só o que está vencido e não pago", async () => {
    estado.pagamentos = [
      {
        status: "pendente",
        valor: 1200,
        vencimento: "2026-07-10",
        alunas: { id: "aluna_bia", nome: "Beatriz Lima" },
      },
      {
        status: "OVERDUE",
        valor: 300,
        vencimento: "2026-07-01",
        alunas: { id: "aluna_bia", nome: "Beatriz Lima" },
      },
      // Pago não entra mesmo vencido (o fake não aplica o filtro lt, mas o
      // código filtra por status).
      {
        status: "CONFIRMED",
        valor: 900,
        vencimento: "2026-07-05",
        alunas: { id: "aluna_ana", nome: "Ana Paula Ribeiro" },
      },
    ];
    const resultado = await chamarTool("pagamentos_pendentes");
    const grupos = JSON.parse(resultado.content[0].text) as Array<Record<string, unknown>>;
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ aluna: "Beatriz Lima", total_em_atraso: 1500 });
  });
});

describe("documentos_nao_assinados", () => {
  it("lista as pendências com aluna e link", async () => {
    estado.documentos = [
      {
        tipo: "Contrato",
        link_drive: "https://drive.google.com/x",
        criado_em: "2026-07-18T10:00:00.000Z",
        alunas: { id: "aluna_bia", nome: "Beatriz Lima" },
      },
    ];
    const resultado = await chamarTool("documentos_nao_assinados");
    const pendencias = JSON.parse(resultado.content[0].text) as Array<Record<string, unknown>>;
    expect(pendencias).toEqual([
      expect.objectContaining({
        aluna: "Beatriz Lima",
        tipo: "Contrato",
        link_drive: "https://drive.google.com/x",
      }),
    ]);
  });
});

describe("proxima_reuniao", () => {
  it("devolve a próxima reunião da aluna resolvida pelo nome", async () => {
    estado.reunioes = [
      {
        data_hora: "2026-07-25T13:00:00.000Z",
        status: "agendada",
        origem: "calendly",
        link: "https://meet.google.com/abc",
      },
    ];
    const resultado = await chamarTool("proxima_reuniao", { nome: "Beatriz Lima" });
    const corpo = JSON.parse(resultado.content[0].text) as Record<string, unknown>;
    expect(corpo).toMatchObject({
      aluna: "Beatriz Lima",
      proxima_reuniao: expect.objectContaining({ data_hora: "2026-07-25T13:00:00.000Z" }),
    });
  });

  it("sem reunião futura devolve aviso claro, não erro", async () => {
    const resultado = await chamarTool("proxima_reuniao", { nome: "Beatriz" });
    expect(resultado.isError).toBeUndefined();
    const corpo = JSON.parse(resultado.content[0].text) as Record<string, unknown>;
    expect(corpo.proxima_reuniao).toBeNull();
    expect(corpo.aviso).toContain("Nenhuma reunião futura");
  });

  it("aluna inexistente tem mensagem clara", async () => {
    const resultado = await chamarTool("proxima_reuniao", { nome: "Zoe" });
    expect(resultado.isError).toBe(true);
    expect(resultado.content[0].text).toContain("Nenhuma aluna encontrada");
  });
});

describe("buscar_formulario", () => {
  beforeEach(() => {
    estado.formularios = [
      {
        id: "form_1",
        formulario_nome: "Anamnese",
        respostas: [{ pergunta: "Restrição alimentar?", resposta: "Intolerância a lactose" }],
        respondido_em: "2026-07-15T08:00:00.000Z",
        alunas: { id: "aluna_bia", nome: "Beatriz Lima" },
      },
      {
        id: "form_2",
        formulario_nome: "Anamnese",
        respostas: [{ pergunta: "Restrição alimentar?", resposta: "Nenhuma" }],
        respondido_em: "2026-07-10T08:00:00.000Z",
        alunas: { id: "aluna_ana", nome: "Ana Paula Ribeiro" },
      },
    ];
  });

  it("acha o termo nas respostas ignorando acento e caixa", async () => {
    const resultado = await chamarTool("buscar_formulario", { query: "LACTOSE" });
    const corpo = JSON.parse(resultado.content[0].text) as {
      resultados: Array<Record<string, unknown>>;
    };
    expect(corpo.resultados).toHaveLength(1);
    expect(corpo.resultados[0]).toMatchObject({ aluna: "Beatriz Lima" });
  });

  it("sem resultados devolve aviso claro", async () => {
    const resultado = await chamarTool("buscar_formulario", { query: "glúten" });
    const corpo = JSON.parse(resultado.content[0].text) as { resultados: unknown[]; aviso: string };
    expect(corpo.resultados).toEqual([]);
    expect(corpo.aviso).toContain("glúten");
  });

  it("query curta demais é rejeitada pela validação de input", async () => {
    const resposta = await POST(requisicaoTool("buscar_formulario", { query: "a" }));
    const corpo = (await resposta.json()) as Record<string, unknown>;
    // A validação Zod do SDK rejeita antes de executar a tool.
    expect(JSON.stringify(corpo)).toMatch(/invalid|inválid|-32602/i);
  });
});
