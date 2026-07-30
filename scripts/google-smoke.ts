/**
 * Teste de fumaça da integração Google (conta de serviço + impersonation).
 *
 * Uso:  npm run google:teste
 * Requer no .env: GOOGLE_SERVICE_ACCOUNT_JSON (base64) e EMAIL_ADRIANA, e a
 * delegação autorizada no admin.google.com com os escopos de ESCOPOS_GOOGLE.
 *
 * Passos: (1) obtém access token impersonando a Adriana; (2) lê 1 evento da
 * Agenda dela. Se ambos passam, a cadeia toda está funcionando.
 */
import "dotenv/config";
import { obterAccessToken } from "@/lib/integrations/google-auth";
import { listarEventos } from "@/lib/integrations/agenda";

interface RespostaAgenda {
  items?: { summary?: string; start?: { dateTime?: string; date?: string } }[];
}

async function main(): Promise<void> {
  const subject = process.env.EMAIL_ADRIANA ?? "(EMAIL_ADRIANA vazio)";
  console.log(`1) Obtendo access token (impersonando ${subject})...`);
  const token = await obterAccessToken();
  console.log(`   ✓ token obtido (${token.length} chars)`);

  console.log("2) Lendo 1 evento da Agenda da Adriana...");
  const resposta = (await listarEventos("primary", {
    maxResults: "1",
    timeMin: new Date().toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
  })) as RespostaAgenda;

  const eventos = resposta.items ?? [];
  console.log(`   ✓ Calendar respondeu. Eventos retornados: ${eventos.length}`);
  const primeiro = eventos[0];
  if (primeiro) {
    const quando = primeiro.start?.dateTime ?? primeiro.start?.date ?? "(sem data)";
    console.log(`     próximo: "${primeiro.summary ?? "(sem título)"}" em ${quando}`);
  }

  console.log("\n✅ Google OK: conta de serviço + impersonation + Calendar funcionando.");
}

main().catch((erro: unknown) => {
  const msg = erro instanceof Error ? erro.message : String(erro);
  console.error("\n❌ Falhou:", msg);
  if (/unauthorized_client|access_denied|invalid_grant/i.test(msg)) {
    console.error(
      "   → Provável: delegação não autorizada (ou escopos divergentes) no admin.google.com,",
    );
    console.error("     ou ainda propagando (pode levar alguns minutos).");
  } else if (/403|has not been used|accessNotConfigured|forbidden/i.test(msg)) {
    console.error("   → Provável: API do Calendar não ativada no projeto GCP.");
  } else if (/EMAIL_ADRIANA|GOOGLE_SERVICE_ACCOUNT_JSON/.test(msg)) {
    console.error("   → Provável: variável de ambiente faltando no .env.");
  }
  process.exit(1);
});
