import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultadoEscrita } from "@/lib/acoes/escrita";
import { executarComAuditoria } from "@/lib/acoes/executar";
import type { Ator } from "@/lib/auditoria";

const { auditoria, criarSupabaseFalso } = vi.hoisted(() => {
  const auditoria: { linhas: Array<Record<string, unknown>>; falhar: boolean } = {
    linhas: [],
    falhar: false,
  };
  function criarSupabaseFalso() {
    return {
      from: (tabela: string) => {
        if (tabela !== "log_auditoria") {
          throw new Error(`Tabela inesperada no teste: ${tabela}`);
        }
        return {
          insert: (registro: Record<string, unknown>) => {
            if (auditoria.falhar) {
              return Promise.resolve({ error: { message: "indisponível" } });
            }
            auditoria.linhas.push({ ...registro });
            return Promise.resolve({ error: null });
          },
        };
      },
    };
  }
  return { auditoria, criarSupabaseFalso };
});

vi.mock("@/lib/db/supabase", () => ({ obterSupabase: criarSupabaseFalso }));

const ATOR_MCP: Ator = { origem: "mcp", tokenId: "tok_1", tokenNome: "token-teste" };
const ATOR_DASH: Ator = { origem: "dashboard", usuario: "adriana@example.com" };

function sucesso(): ResultadoEscrita {
  return {
    status: "sucesso",
    resultado: "feito",
    mensagem: "Deu certo.",
    dados: { ok: true },
    alunaIdAuditoria: "aluna_1",
  };
}

beforeEach(() => {
  auditoria.linhas = [];
  auditoria.falhar = false;
});

describe("executarComAuditoria", () => {
  it("sucesso: retorna ok com dados e audita o resultado", async () => {
    const desfecho = await executarComAuditoria(ATOR_MCP, "acao_x", "aluna_1", async () =>
      sucesso()
    );

    expect(desfecho).toEqual({ status: "ok", mensagem: "Deu certo.", dados: { ok: true } });
    expect(auditoria.linhas).toEqual([
      expect.objectContaining({
        origem: "mcp",
        acao: "acao_x",
        aluna_id: "aluna_1",
        resultado: "feito",
        detalhes: expect.objectContaining({ token_nome: "token-teste" }),
      }),
    ]);
  });

  it("recusa: retorna recusado e audita, com a aluna do núcleo", async () => {
    const desfecho = await executarComAuditoria(ATOR_DASH, "acao_x", "aluna_1", async () => ({
      status: "recusa",
      resultado: "recusado: motivo",
      mensagem: "Não deu.",
      dados: {},
      alunaIdAuditoria: null,
    }));

    expect(desfecho).toEqual({ status: "recusado", mensagem: "Não deu." });
    expect(auditoria.linhas[0]).toMatchObject({
      origem: "dashboard",
      aluna_id: null,
      resultado: "recusado: motivo",
      detalhes: { usuario: "adriana@example.com" },
    });
  });

  it("núcleo lança: retorna erro e audita 'erro:' com aluna nula", async () => {
    const desfecho = await executarComAuditoria(ATOR_MCP, "acao_x", "aluna_1", async () => {
      throw new Error("caiu a api");
    });

    expect(desfecho).toEqual({ status: "erro" });
    expect(auditoria.linhas[0]).toMatchObject({
      aluna_id: null,
      resultado: "erro: caiu a api",
    });
  });

  it("auditoria falha: retorna sem_auditoria (nada é dado como concluído)", async () => {
    auditoria.falhar = true;
    const desfecho = await executarComAuditoria(ATOR_MCP, "acao_x", "aluna_1", async () =>
      sucesso()
    );

    expect(desfecho).toEqual({ status: "sem_auditoria" });
    expect(auditoria.linhas).toEqual([]);
  });
});
