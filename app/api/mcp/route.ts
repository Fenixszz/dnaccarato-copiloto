import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { NextResponse } from "next/server";
import { registrarErroDeRota } from "@/lib/log";
import { autenticarTokenMcp } from "@/lib/mcp/autenticacao";
import { criarServidorMcp } from "@/lib/mcp/servidor";

const ROTA = "/api/mcp";

// Servidor MCP em modo stateless: cada POST cria servidor + transport
// descartáveis (sem sessão), com resposta JSON direta. Autenticação por
// Bearer token da tabela api_tokens; o escopo do token define quais tools
// existem pra ele.
export async function POST(request: Request) {
  try {
    const token = await autenticarTokenMcp(request.headers.get("authorization"));
    if (token === null) {
      return NextResponse.json({ erro: "Token ausente, inválido ou revogado" }, { status: 401 });
    }

    const servidor = criarServidorMcp(token);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await servidor.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      void transport.close();
      void servidor.close();
    }
  } catch (erro) {
    registrarErroDeRota({ rota: ROTA }, erro);
    return NextResponse.json({ erro: "Erro interno no servidor MCP" }, { status: 500 });
  }
}

// Stateless: não há sessão SSE pra retomar nem encerrar.
export function GET() {
  return NextResponse.json(
    { erro: "Servidor MCP stateless: use POST com JSON-RPC" },
    { status: 405 }
  );
}

export function DELETE() {
  return NextResponse.json(
    { erro: "Servidor MCP stateless: não há sessão pra encerrar" },
    { status: 405 }
  );
}
