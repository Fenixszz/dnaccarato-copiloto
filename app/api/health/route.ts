import { NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/webhooks/validation";

export const dynamic = "force-dynamic";

/**
 * Health check simples. Não toca em serviços externos — só confirma que o
 * processo está de pé e respondendo.
 */
export async function GET(): Promise<NextResponse> {
  return comTratamentoDeErro({ rota: "GET /api/health" }, async () => {
    return NextResponse.json({
      status: "ok",
      servico: "dnaccarato-copiloto",
      timestamp: new Date().toISOString(),
    });
  });
}
