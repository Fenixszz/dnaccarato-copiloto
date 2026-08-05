import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Testa a rota MCP (JSON-RPC): autenticação Bearer contra api_tokens, escopo
 * por token, e dispatch de initialize / tools/list / tools/call. O cliente
 * Supabase é um stub por-tabela (auth + dados da tool).
 */

interface RQ {
  data: unknown;
  error: { message: string } | null;
}

const holder = vi.hoisted(() => ({ porTabela: {} as Record<string, RQ> }));

vi.mock("@/lib/db/client", () => {
  const make = (tabela: string) => {
    const res = (): RQ => holder.porTabela[tabela] ?? { data: null, error: null };
    const q = {
      select: () => q,
      eq: () => q,
      or: () => q,
      ilike: () => q,
      limit: () => q,
      insert: () => q,
      update: () => q,
      maybeSingle: () => Promise.resolve(res()),
      then: (aoResolver: (v: RQ) => unknown) => Promise.resolve(res()).then(aoResolver),
    };
    return q;
  };
  return { getServiceClient: () => ({ from: (t: string) => make(t) }) };
});

import { POST } from "@/app/api/mcp/route";

const UUID = "11111111-1111-1111-1111-111111111111";

function rpc(body: unknown, token?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function tokenAtivo(escopo: string[]): void {
  holder.porTabela.api_tokens = {
    data: { id: "tok-1", escopo, status: "ativo", expira_em: null },
    error: null,
  };
  holder.porTabela.log_auditoria = { data: null, error: null };
}

beforeEach(() => {
  holder.porTabela = {};
});

describe("POST /api/mcp", () => {
  it("sem token → 401", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toMatch(/inválido/i);
  });

  it("token inexistente → 401", async () => {
    holder.porTabela.api_tokens = { data: null, error: null };
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "qualquer"),
    );
    expect(res.status).toBe(401);
  });

  it("token revogado → 401", async () => {
    holder.porTabela.api_tokens = {
      data: { id: "t", escopo: ["dossie_aluna"], status: "revogado", expira_em: null },
      error: null,
    };
    const res = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "x"));
    expect(res.status).toBe(401);
  });

  it("initialize retorna serverInfo", async () => {
    tokenAtivo([]);
    const res = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "initialize" }, "x"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe("dnaccarato-copiloto");
  });

  it("tools/list mostra só as tools do escopo do token", async () => {
    tokenAtivo(["dossie_aluna", "detectar_furos"]);
    const res = await POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, "x"));
    const body = await res.json();
    const nomes = body.result.tools.map((t: { name: string }) => t.name);
    expect(nomes).toEqual(["dossie_aluna", "detectar_furos"]);
    expect(nomes).not.toContain("buscar_aluna");
  });

  it("tools/call dentro do escopo executa e retorna resultado", async () => {
    tokenAtivo(["dossie_aluna"]);
    holder.porTabela.alunas = {
      data: {
        id: UUID,
        nome: "Ana Prado",
        email: "ana@ex.com",
        telefone: null,
        criado_em: "2026-01-01T00:00:00Z",
        metadata: {},
        pagamentos: [],
        documentos: [],
        materiais: [],
        formularios: [],
        reunioes: [],
        tasks_asana: [],
      },
      error: null,
    };
    const res = await POST(
      rpc(
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "dossie_aluna", arguments: { aluna_id: UUID } },
        },
        "x",
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const conteudo = JSON.parse(body.result.content[0].text);
    expect(conteudo.aluna).toMatchObject({ id: UUID, nome: "Ana Prado" });
  });

  it("tools/call fora do escopo → erro claro, sem vazar", async () => {
    tokenAtivo(["dossie_aluna"]); // buscar_aluna NÃO está no escopo
    const res = await POST(
      rpc(
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "buscar_aluna", arguments: { termo: "ana" } },
        },
        "x",
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error.code).toBe(-32001);
    expect(body.error.message).toMatch(/não autorizada/i);
  });

  it("tools/call com argumentos inválidos → InvalidParams", async () => {
    tokenAtivo(["dossie_aluna"]);
    const res = await POST(
      rpc(
        {
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: { name: "dossie_aluna", arguments: { aluna_id: "nao-uuid" } },
        },
        "x",
      ),
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32602); // InvalidParams
  });

  it("método desconhecido → MethodNotFound", async () => {
    tokenAtivo([]);
    const res = await POST(rpc({ jsonrpc: "2.0", id: 6, method: "foo/bar" }, "x"));
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });
});
