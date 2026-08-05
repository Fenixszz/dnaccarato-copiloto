import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Testa as tools de leitura do MCP: validação de input, "aluna não encontrada"
 * com mensagem clara, e os retornos de cada tool. Supabase é um stub por-tabela;
 * o Gmail (buscar_email) é mockado.
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
      in: () => q,
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

vi.mock("@/lib/integrations/gmail", () => ({
  buscarEmails: vi.fn(() =>
    Promise.resolve([
      {
        id: "m1",
        assunto: "Re: Contrato",
        trecho: "segue o contrato...",
        data: "Mon, 4 Aug 2026",
      },
    ]),
  ),
}));

import { POST } from "@/app/api/mcp/route";

const TODAS = [
  "status_aluna",
  "pagamentos_pendentes",
  "documentos_nao_assinados",
  "proxima_reuniao",
  "buscar_formulario",
  "buscar_email",
];
const UUID = "11111111-1111-1111-1111-111111111111";

function chamar(name: string, args: unknown): Promise<Response> {
  holder.porTabela.api_tokens = {
    data: { id: "tok-1", escopo: TODAS, status: "ativo", expira_em: null },
    error: null,
  };
  holder.porTabela.log_auditoria = { data: null, error: null };
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  };
  return POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer x" },
      body: JSON.stringify(body),
    }),
  );
}

const conteudo = async (res: Response) =>
  JSON.parse((await res.json()).result.content[0].text);
const erro = async (res: Response) => (await res.json()).error;

beforeEach(() => {
  holder.porTabela = {};
});

describe("MCP tools de leitura", () => {
  it("status_aluna: aluna não encontrada → mensagem clara", async () => {
    holder.porTabela.alunas = { data: [], error: null }; // nenhuma aluna → sem match
    const res = await chamar("status_aluna", { nome: "Fulana Inexistente" });
    const e = await erro(res);
    expect(e.code).toBe(-32004);
    expect(e.message).toMatch(/não encontrada/i);
    expect(e.message).toContain("Fulana Inexistente");
  });

  it("status_aluna: sem nome → InvalidParams", async () => {
    const res = await chamar("status_aluna", {});
    expect((await erro(res)).code).toBe(-32602);
  });

  it("pagamentos_pendentes: retorna atrasados", async () => {
    holder.porTabela.pagamentos = {
      data: [
        { aluna_id: "a1", valor: 500, status: "atrasado", alunas: { nome: "Bruna" } },
      ],
      error: null,
    };
    const res = await chamar("pagamentos_pendentes", {});
    expect((await conteudo(res)).pagamentos_atrasados).toHaveLength(1);
  });

  it("documentos_nao_assinados: separa pendentes de rejeitados", async () => {
    holder.porTabela.documentos = {
      data: [
        { id: "d1", tipo: "contrato", status: "pendente", motivo_rejeicao: null },
        {
          id: "d2",
          tipo: "contrato",
          status: "rejeitado",
          motivo_rejeicao: "Dados divergentes",
        },
      ],
      error: null,
    };
    const c = await conteudo(await chamar("documentos_nao_assinados", {}));
    expect(c.pendentes.map((d: { id: string }) => d.id)).toEqual(["d1"]);
    expect(c.rejeitados.map((d: { id: string }) => d.id)).toEqual(["d2"]);
  });

  it("proxima_reuniao: acha a aluna e retorna a próxima agendada", async () => {
    holder.porTabela.alunas = {
      data: [{ id: "a1", nome: "Ana Prado", email: null, telefone: null }],
      error: null,
    };
    holder.porTabela.reunioes = {
      data: [
        {
          id: "r1",
          status: "cancelada",
          data_hora: "2027-01-01T10:00:00Z",
          origem: "calendly",
          link: null,
        },
        {
          id: "r2",
          status: "agendada",
          data_hora: "2099-01-01T10:00:00Z",
          origem: "calendly",
          link: "z",
        },
      ],
      error: null,
    };
    const c = await conteudo(await chamar("proxima_reuniao", { nome: "Ana Prado" }));
    expect(c.proxima_reuniao.id).toBe("r2");
  });

  it("buscar_formulario: retorna formulários", async () => {
    holder.porTabela.formularios = {
      data: [
        {
          id: "f1",
          formulario_nome: "Onboarding",
          respondido_em: "2026-08-01T00:00:00Z",
        },
      ],
      error: null,
    };
    const c = await conteudo(await chamar("buscar_formulario", { query: "onboard" }));
    expect(c.formularios).toHaveLength(1);
  });

  it("buscar_email: aluna encontrada → retorna e-mails do Gmail", async () => {
    holder.porTabela.alunas = {
      data: { id: UUID, nome: "Ana Prado", email: "ana@ex.com" },
      error: null,
    };
    const c = await conteudo(
      await chamar("buscar_email", { aluna_id: UUID, query: "contrato" }),
    );
    expect(c.emails).toHaveLength(1);
    expect(c.emails[0]).toMatchObject({ assunto: "Re: Contrato" });
  });

  it("buscar_email: aluna não encontrada → mensagem clara", async () => {
    holder.porTabela.alunas = { data: null, error: null };
    const res = await chamar("buscar_email", { aluna_id: UUID, query: "contrato" });
    const e = await erro(res);
    expect(e.code).toBe(-32004);
    expect(e.message).toMatch(/não encontrada/i);
  });

  it("buscar_email: aluna_id não-uuid → InvalidParams", async () => {
    const res = await chamar("buscar_email", { aluna_id: "abc", query: "x" });
    expect((await erro(res)).code).toBe(-32602);
  });
});
