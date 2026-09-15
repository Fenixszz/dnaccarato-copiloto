import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { comTratamentoDeErro, logarErro } from "@/lib/webhooks/validation";
import { requireEnv, optionalEnv } from "@/lib/env";
import { getStartPageToken, criarWatchChanges } from "@/lib/integrations/drive";
import { salvarEstado } from "@/lib/db/queries";
import { sincronizarTarefasAsana } from "@/lib/asana/sincronizarTarefas";

export const dynamic = "force-dynamic";

/** 7 dias em ms — o máximo que o Google concede para o canal de changes. */
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Renovação do watch do Google Drive — chamado pelo Cron da Vercel.
 *
 * Canais de push do Drive expiram (o Google concede no máx. ~7 dias). Esta rota
 * recria o canal apontando para `/api/webhooks/drive` e salva o pageToken atual,
 * de forma idêntica ao `scripts/drive-watch.ts`, só que automatizada. Com a
 * validade de 7 dias e um cron diário, há folga grande — mesmo que um disparo
 * falhe, o canal anterior ainda cobre vários dias.
 *
 * Protegida: exige Authorization: Bearer <CRON_SECRET> (a Vercel injeta esse
 * header automaticamente quando CRON_SECRET está definido).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rota = "GET /api/cron/drive-watch";

  return comTratamentoDeErro({ rota }, async () => {
    // Autorização do cron (mesmo esquema do briefing).
    if (request.headers.get("authorization") !== `Bearer ${requireEnv("CRON_SECRET")}`) {
      logarErro(new Error("Chamada ao cron sem autorização"), { rota });
      return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
    }

    requireEnv("DRIVE_ROOT_FOLDER_ID"); // o webhook filtra por ela ao processar
    const token = requireEnv("DRIVE_CHANNEL_TOKEN");
    const base = optionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000").replace(
      /\/$/,
      "",
    );
    const address = `${base}/api/webhooks/drive`;

    const pageToken = await getStartPageToken();
    await salvarEstado("drive_page_token", { pageToken });

    const canal = await criarWatchChanges({
      id: randomUUID(),
      address,
      token,
      pageToken,
      expiration: String(Date.now() + VALIDADE_MS),
    });

    // Piggyback: sincroniza as tarefas do Asana (coluna CONSULTORIA) no mesmo
    // cron diário — evita gastar um 2º slot de cron (limite do plano Hobby).
    // Best-effort: falha aqui não derruba a renovação do watch do Drive.
    let asana: unknown = { status: "pulado" };
    try {
      asana = await sincronizarTarefasAsana();
    } catch (erro) {
      logarErro(erro, { rota, resumo: { etapa: "asana-sync" } });
      asana = { status: "falhou" };
    }

    return NextResponse.json({
      status: "renovado",
      channelId: canal.id,
      resourceId: canal.resourceId,
      expira: canal.expiration ? new Date(Number(canal.expiration)).toISOString() : null,
      asana,
    });
  });
}
