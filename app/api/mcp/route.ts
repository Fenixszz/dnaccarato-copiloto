import { NextResponse } from "next/server";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { logarErro } from "@/lib/webhooks/validation";
import { autenticarBearer, type TokenAutenticado } from "@/lib/mcp/auth";
import { FERRAMENTAS, acharFerramenta } from "@/lib/mcp/tools";
import { executarFerramentaAuditada } from "@/lib/mcp/executar";

export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2024-11-05";
// Código server-defined para "não autorizado" (fora do range reservado do JSON-RPC).
const CODIGO_NAO_AUTORIZADO = -32001;
// Código server-defined para erro de negócio da tool (ex.: aluna não encontrada).
const CODIGO_ERRO_FERRAMENTA = -32004;

type IdRpc = string | number | null;

function ok(id: IdRpc, result: unknown): NextResponse {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function erroRpc(id: IdRpc, code: number, message: string, status = 200): NextResponse {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
}

/**
 * Servidor MCP (Model Context Protocol) sobre JSON-RPC 2.0, hospedado como rota
 * Next. Autenticação Bearer contra api_tokens; cada token tem um escopo (array
 * de tools). Requisição sem token válido ou fora do escopo recebe erro claro,
 * sem vazar detalhe interno.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rota = "POST /api/mcp";

  // --- Autenticação (antes de qualquer coisa) ---
  let token: TokenAutenticado | null = null;
  try {
    token = await autenticarBearer(request.headers.get("authorization"));
  } catch (erro) {
    logarErro(erro, { rota });
    return erroRpc(null, ErrorCode.InternalError, "Erro interno.", 500);
  }
  if (!token) {
    return erroRpc(
      null,
      CODIGO_NAO_AUTORIZADO,
      "Token de autenticação ausente ou inválido.",
      401,
    );
  }
  const escopo = token.escopo;

  // --- Parse JSON-RPC ---
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return erroRpc(null, ErrorCode.ParseError, "Corpo não é JSON válido.", 400);
  }
  if (typeof corpo !== "object" || corpo === null) {
    return erroRpc(null, ErrorCode.InvalidRequest, "Requisição JSON-RPC inválida.", 400);
  }

  const msg = corpo as { id?: IdRpc; method?: unknown; params?: unknown };
  const id: IdRpc = msg.id ?? null;
  const method = typeof msg.method === "string" ? msg.method : "";
  const params =
    typeof msg.params === "object" && msg.params !== null
      ? (msg.params as Record<string, unknown>)
      : {};

  // Notificações não esperam resposta.
  if (method.startsWith("notifications/")) {
    return new NextResponse(null, { status: 202 });
  }

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: { name: "dnaccarato-copiloto", version: "0.1.0" },
        capabilities: { tools: {} },
      });

    case "ping":
      return ok(id, {});

    case "tools/list": {
      // Só as tools dentro do escopo do token.
      const tools = FERRAMENTAS.filter((f) => escopo.includes(f.name)).map((f) => ({
        name: f.name,
        description: f.description,
        inputSchema: f.inputSchema,
      }));
      return ok(id, { tools });
    }

    case "tools/call": {
      const nome = typeof params.name === "string" ? params.name : "";
      const ferramenta = acharFerramenta(nome);

      // Não distingue "inexistente" de "fora do escopo" — mensagem clara, sem vazar.
      if (!ferramenta || !escopo.includes(nome)) {
        return erroRpc(
          id,
          CODIGO_NAO_AUTORIZADO,
          `Ferramenta não autorizada ou inexistente: ${nome}.`,
        );
      }

      const args = ferramenta.argsSchema.safeParse(params.arguments ?? {});
      if (!args.success) {
        return erroRpc(
          id,
          ErrorCode.InvalidParams,
          "Parâmetros inválidos para a ferramenta.",
        );
      }

      const alunaId = extrairAlunaId(args.data);
      const exec = await executarFerramentaAuditada({
        ferramenta,
        args: args.data,
        origem: "mcp",
        alunaId,
        detalhesBase: { token_id: token.id },
      });
      if (exec.ok) {
        return ok(id, {
          content: [{ type: "text", text: JSON.stringify(exec.resultado) }],
        });
      }
      // Erro de negócio (ex.: aluna não encontrada) → mensagem clara e segura.
      if (exec.erroNegocio !== undefined) {
        return erroRpc(id, CODIGO_ERRO_FERRAMENTA, exec.erroNegocio);
      }
      // Erro interno → não vaza detalhe.
      logarErro(exec.erroInterno, { rota, resumo: { tool: nome } });
      return erroRpc(id, ErrorCode.InternalError, "Erro ao executar a ferramenta.");
    }

    default:
      return erroRpc(id, ErrorCode.MethodNotFound, `Método não suportado: ${method}.`);
  }
}

/** Extrai um aluna_id (uuid) dos argumentos, se houver, para a auditoria. */
function extrairAlunaId(args: unknown): string | undefined {
  if (args !== null && typeof args === "object" && "aluna_id" in args) {
    const valor = (args as { aluna_id: unknown }).aluna_id;
    return typeof valor === "string" ? valor : undefined;
  }
  return undefined;
}
