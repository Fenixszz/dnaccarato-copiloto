/**
 * Registra (ou renova) o canal de push notifications do Google Drive apontando
 * para /api/webhooks/drive, e salva o pageToken inicial.
 *
 * Uso:  npm run drive:watch
 * Requer no .env: credenciais Google (conta de serviço + EMAIL_ADRIANA),
 * DRIVE_ROOT_FOLDER_ID, DRIVE_CHANNEL_TOKEN e NEXT_PUBLIC_APP_URL (pública).
 *
 * Canais do Drive expiram — reexecute antes da expiração para renovar.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { optionalEnv, requireEnv } from "@/lib/env";
import { getStartPageToken, criarWatchChanges } from "@/lib/integrations/drive";
import { salvarEstado } from "@/lib/db/queries";

async function main(): Promise<void> {
  requireEnv("DRIVE_ROOT_FOLDER_ID"); // usado pelo webhook ao filtrar mudanças
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
    expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  console.log("✅ Watch do Drive criado.");
  console.log(`  address:    ${address}`);
  console.log(`  channelId:  ${canal.id}`);
  console.log(`  resourceId: ${canal.resourceId}`);
  console.log(
    `  expira:     ${
      canal.expiration
        ? new Date(Number(canal.expiration)).toISOString()
        : "(desconhecido)"
    }`,
  );
  console.log("  pageToken inicial salvo em estado_integracoes (drive_page_token).");
  console.log("\n⚠️  Canais expiram — reexecute este script antes da expiração.");
}

main().catch((erro: unknown) => {
  console.error("❌ Falhou:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
