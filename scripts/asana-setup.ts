/**
 * Cria o webhook da Asana apontando para /api/webhooks/asana.
 *
 * Uso:  npm run asana:setup -- <RESOURCE_GID>
 * (ou defina ASANA_WEBHOOK_RESOURCE_ID no .env). RESOURCE_GID = id do projeto
 * de tasks da Adriana.
 *
 * IMPORTANTE: a Asana faz um handshake SÍNCRONO — ela bate no target com o
 * header X-Hook-Secret e o endpoint precisa ecoá-lo. Portanto só funciona com
 * NEXT_PUBLIC_APP_URL público via HTTPS (não aceita localhost). O X-Hook-Secret
 * é capturado e salvo pelo próprio endpoint durante o handshake.
 */
import "dotenv/config";
import { optionalEnv, requireEnv } from "@/lib/env";
import { criarWebhook } from "@/lib/integrations/asana";

async function main(): Promise<void> {
  const resource = process.argv[2] ?? requireEnv("ASANA_WEBHOOK_RESOURCE_ID");
  const base = optionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const target = `${base}/api/webhooks/asana`;

  if (base.startsWith("http://localhost")) {
    console.warn(
      "⚠️  NEXT_PUBLIC_APP_URL é localhost — a Asana não consegue fazer o handshake. Use uma URL HTTPS pública.",
    );
  }

  console.log(`Criando webhook Asana: resource ${resource} → ${target}`);
  const webhook = await criarWebhook(resource, target);

  console.log(`✅ Webhook criado: ${webhook.gid}`);
  console.log("O X-Hook-Secret foi capturado e salvo pelo endpoint no handshake.");
}

main().catch((erro: unknown) => {
  console.error("❌ Falhou:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
