import { NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/webhooks/validation";
import { requireEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Dispara o briefing diário.
 *
 * Protegida por segredo compartilhado (CRON_SECRET) no header Authorization:
 *   Authorization: Bearer <CRON_SECRET>
 * Impede que qualquer um dispare o briefing. A geração/priorização em si
 * (lógica de negócio) entra em sub-fase futura e terá teste unitário.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rota = "POST /api/cron/briefing";

  return comTratamentoDeErro({ rota }, async () => {
    const esperado = `Bearer ${requireEnv("CRON_SECRET")}`;
    const recebido = request.headers.get("authorization");

    if (recebido !== esperado) {
      return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
    }

    // TODO(fase-briefing): montar e disparar o briefing diário.
    return NextResponse.json({
      status: "ok",
      acao: "briefing_diario",
      timestamp: new Date().toISOString(),
    });
  });
}
