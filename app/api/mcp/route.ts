import { NextResponse } from "next/server";
import { z } from "zod";
import { comTratamentoDeErro, validarCorpo } from "@/lib/webhooks/validation";

export const dynamic = "force-dynamic";

/**
 * Endpoint do servidor MCP (Model Context Protocol).
 *
 * Esqueleto: recebe requisições JSON-RPC 2.0 e responde ao "initialize" e
 * "tools/list". As tools de escrita (que registram auditoria) entram por
 * sub-fase futura. Toda entrada é validada com Zod antes de processar.
 */

const jsonRpcSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const rota = "POST /api/mcp";

  return comTratamentoDeErro({ rota }, async () => {
    const validado = await validarCorpo(request, jsonRpcSchema, { rota });
    if (!validado.ok) {
      return validado.resposta;
    }

    const { id = null, method } = validado.data;

    switch (method) {
      case "initialize":
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: { name: "dnaccarato-copiloto", version: "0.1.0" },
            capabilities: { tools: {} },
          },
        });

      case "tools/list":
        // Nenhuma tool registrada ainda.
        return NextResponse.json({ jsonrpc: "2.0", id, result: { tools: [] } });

      default:
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Método não suportado: ${method}` },
        });
    }
  });
}
