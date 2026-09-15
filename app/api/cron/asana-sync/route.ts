import { NextResponse } from "next/server";
import { comTratamentoDeErro, logarErro } from "@/lib/webhooks/validation";
import { requireEnv } from "@/lib/env";
import { sincronizarTarefasAsana } from "@/lib/asana/sincronizarTarefas";

export const dynamic = "force-dynamic";

/**
 * Sincronização das tarefas do Asana (coluna CONSULTORIA) — chamada pelo Cron
 * da Vercel. Importa/atualiza os cards em `tasks_asana`, casando/criando a
 * aluna. Como o webhook do Asana só ATUALIZA tarefas já rastreadas, este cron é
 * quem GARANTE que cards criados direto no Asana apareçam no dashboard.
 *
 * Protegida: exige Authorization: Bearer <CRON_SECRET> (a Vercel injeta esse
 * header automaticamente quando CRON_SECRET está definido).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rota = "GET /api/cron/asana-sync";

  return comTratamentoDeErro({ rota }, async () => {
    if (request.headers.get("authorization") !== `Bearer ${requireEnv("CRON_SECRET")}`) {
      logarErro(new Error("Chamada ao cron sem autorização"), { rota });
      return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
    }

    const resultado = await sincronizarTarefasAsana();
    return NextResponse.json({ status: "sincronizado", ...resultado });
  });
}
