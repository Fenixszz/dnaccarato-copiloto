/**
 * Cria a webhook subscription do Calendly e imprime o signing_key.
 *
 * Uso:  npm run calendly:setup
 * Requer no .env: CALENDLY_API_TOKEN (Personal Access Token da Adriana) e
 * NEXT_PUBLIC_APP_URL (a URL pública que receberá os webhooks).
 *
 * Ao final, copie o CALENDLY_WEBHOOK_SIGNING_KEY impresso para o .env — é ele
 * que valida a assinatura de cada webhook recebido.
 */
import "dotenv/config";
import { optionalEnv } from "../lib/env";
import {
  usuarioAtual,
  criarWebhookSubscription,
  EVENTOS_CALENDLY,
} from "../lib/integrations/calendly";

interface UsuarioCalendly {
  resource: { uri: string; current_organization: string };
}

async function main(): Promise<void> {
  const me = (await usuarioAtual()) as UsuarioCalendly;
  const user = me.resource.uri;
  const organization = me.resource.current_organization;

  const base = optionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const url = `${base}/api/webhooks/calendly`;

  console.log(`Criando subscription para ${url}`);
  console.log(`  eventos: ${EVENTOS_CALENDLY.join(", ")}`);
  console.log(`  scope: user (${user})`);

  const sub = await criarWebhookSubscription({ url, organization, user, scope: "user" });

  console.log(`\n✅ Subscription criada: ${sub.uri}`);
  console.log("\nCopie para o .env (valida a assinatura dos webhooks):");
  console.log(`CALENDLY_WEBHOOK_SIGNING_KEY="${sub.signing_key}"`);
}

main().catch((erro: unknown) => {
  console.error("❌ Falhou:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
