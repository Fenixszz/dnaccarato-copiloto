import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/api/mcp/route";

const TOKEN = "mcp_token_de_teste";
const TOKEN_HASH = createHash("sha256").update(TOKEN).digest("hex");

// Fake em memória: api_tokens (autenticação) e alunas (tools de leitura).
const { estado, criarSupabaseFalso } = vi.hoisted(() => {
  const estado: {
    tokens: Map<string, Record<string, unknown>>;
    alunas: Array<Record<string, unknown>>;
    dossieData: unknown;
  } = {
    tokens: new Map(),
    alunas: [],
    dossieData: null,
  };

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
        if (tabela === "alunas") {
          // Builder que serve tanto a lista simples (await após .order())
          // quanto a query embutida do dossiê (termina em .maybeSingle()).
          const consulta = {
            eq: () => consulta,
            gte: () => consulta,
            neq: () => consulta,
            is: () => consulta,
            order: () => consulta,
            limit: () => consulta,
            maybeSingle: () => Promise.resolve({ data: estado.dossieData, error: null }),
            then: (
              cumprir: (valor: { data: unknown; error: null }) => unknown,
              rejeitar?: (motivo: unknown) => unknown
            ) => Promise.resolve({ data: [...estado.alunas], error: null }).then(cumprir, rejeitar),
          };
          return { select: () => consulta };
        }
        throw new Error(`Tabela inesperada no teste: ${tabela}`);
      },
    };
  }

  return { estado, criarSupabaseFalso };
});

vi.mock("@/lib/db/supabase", () => ({ obterSupabase: criarSupabaseFalso }));

function requisicaoMcp(corpo: unknown, token: string | null = TOKEN): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (token !== null) {
    headers.authorization = `Bearer ${token}`;
  }
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(corpo),
  });
}

function chamadaJsonRpc(metodo: string, params: unknown, id = 1) {
  return { jsonrpc: "2.0", id, method: metodo, params };
}

beforeEach(() => {
  estado.tokens.clear();
  estado.alunas = [
    { id: "aluna_1", nome: "Ana Paula Ribeiro", email: "ana@example.com", telefone: null },
    { id: "aluna_2", nome: "Beatriz Lima", email: null, telefone: "11922220002" },
  ];
  estado.dossieData = null;
  estado.tokens.set(TOKEN_HASH, {
    id: "token_1",
    nome: "token-de-teste",
    escopo: ["listar_alunas", "dossie_da_aluna"],
    status: "ativo",
  });
});

describe("POST /api/mcp — autenticação", () => {
  it("sem Authorization responde 401", async () => {
    const resposta = await POST(requisicaoMcp(chamadaJsonRpc("tools/list", {}), null));
    expect(resposta.status).toBe(401);
    const corpo: { erro: string } = await resposta.json();
    expect(corpo.erro).toContain("Token");
  });

  it("token desconhecido responde 401 sem vazar detalhe", async () => {
    const resposta = await POST(
      requisicaoMcp(chamadaJsonRpc("tools/list", {}), "mcp_token_que_nao_existe")
    );
    expect(resposta.status).toBe(401);
  });

  it("token revogado responde 401", async () => {
    estado.tokens.set(TOKEN_HASH, {
      id: "token_1",
      nome: "token-de-teste",
      escopo: ["listar_alunas"],
      status: "revogado",
    });
    const resposta = await POST(requisicaoMcp(chamadaJsonRpc("tools/list", {})));
    expect(resposta.status).toBe(401);
  });
});

describe("POST /api/mcp — escopo", () => {
  it("tools/list mostra só as tools do escopo do token", async () => {
    const resposta = await POST(requisicaoMcp(chamadaJsonRpc("tools/list", {})));
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as {
      result: { tools: Array<{ name: string }> };
    };
    const nomes = corpo.result.tools.map((tool) => tool.name).sort();
    expect(nomes).toEqual(["dossie_da_aluna", "listar_alunas"]);
  });

  it("chamar tool fora do escopo devolve erro claro sem detalhe interno", async () => {
    const resposta = await POST(
      requisicaoMcp(
        chamadaJsonRpc("tools/call", { name: "detectar_furos", arguments: { aluna_id: "x" } })
      )
    );
    const corpo = (await resposta.json()) as {
      result: { content: Array<{ text: string }>; isError?: boolean };
    };
    expect(corpo.result.isError).toBe(true);
    expect(corpo.result.content[0].text).toContain("detectar_furos not found");
    expect(corpo.result.content[0].text).not.toContain("Supabase");
  });
});

describe("POST /api/mcp — execução de tools", () => {
  it("listar_alunas devolve as alunas em JSON", async () => {
    const resposta = await POST(
      requisicaoMcp(chamadaJsonRpc("tools/call", { name: "listar_alunas", arguments: {} }))
    );
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as {
      result: { content: Array<{ type: string; text: string }> };
    };
    const alunas = JSON.parse(corpo.result.content[0].text) as Array<{ nome: string }>;
    expect(alunas.map((aluna) => aluna.nome)).toEqual(["Ana Paula Ribeiro", "Beatriz Lima"]);
  });

  it("listar_alunas com busca filtra ignorando acento e caixa", async () => {
    const resposta = await POST(
      requisicaoMcp(
        chamadaJsonRpc("tools/call", { name: "listar_alunas", arguments: { busca: "BEATRIZ" } })
      )
    );
    const corpo = (await resposta.json()) as {
      result: { content: Array<{ text: string }> };
    };
    const alunas = JSON.parse(corpo.result.content[0].text) as Array<{ nome: string }>;
    expect(alunas).toHaveLength(1);
    expect(alunas[0].nome).toBe("Beatriz Lima");
  });

  it("dossie_da_aluna monta o dossiê da aluna existente", async () => {
    estado.dossieData = {
      id: "3f1c4a68-9a1b-4f4e-8a2e-5b6c7d8e9f10",
      nome: "Ana Paula Ribeiro",
      email: "ana@example.com",
      telefone: null,
      criado_em: "2026-07-01T10:00:00.000Z",
      pagamentos: [],
      documentos: [],
      formularios: [],
      reunioes: [],
      tasks_asana: [],
    };
    const resposta = await POST(
      requisicaoMcp(
        chamadaJsonRpc("tools/call", {
          name: "dossie_da_aluna",
          arguments: { aluna_id: "3f1c4a68-9a1b-4f4e-8a2e-5b6c7d8e9f10" },
        })
      )
    );
    const corpo = (await resposta.json()) as {
      result: { content: Array<{ text: string }>; isError?: boolean };
    };
    expect(corpo.result.isError).toBeUndefined();
    const dossie = JSON.parse(corpo.result.content[0].text) as Record<string, unknown>;
    expect(dossie.aluna).toMatchObject({ nome: "Ana Paula Ribeiro" });
    expect(dossie.pagamentos).toMatchObject({ situacao: "sem_registros" });
  });

  it("dossie_da_aluna de aluna inexistente devolve erro claro", async () => {
    estado.dossieData = null;
    const resposta = await POST(
      requisicaoMcp(
        chamadaJsonRpc("tools/call", {
          name: "dossie_da_aluna",
          arguments: { aluna_id: "3f1c4a68-9a1b-4f4e-8a2e-5b6c7d8e9f10" },
        })
      )
    );
    const corpo = (await resposta.json()) as {
      result: { content: Array<{ text: string }>; isError?: boolean };
    };
    expect(corpo.result.isError).toBe(true);
    expect(corpo.result.content[0].text).toContain("Nenhuma aluna");
  });
});

describe("métodos não suportados", () => {
  it("GET e DELETE respondem 405", async () => {
    expect((await GET()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
  });
});
