// Registra o canal de notificação push do Google Drive apontando pra rota
// /api/webhooks/drive.
//
// Uso: npm run drive:watch -- https://SEU-DOMINIO/api/webhooks/drive
//
// Pré-requisitos:
//   - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN e
//     DRIVE_WEBHOOK_TOKEN no .env.local
//   - A URL precisa ser HTTPS pública (o Google recusa localhost)
//
// IMPORTANTE: canais do Drive EXPIRAM (o script imprime quando). Rode este
// script de novo antes da expiração — re-rodar é seguro, o canal antigo
// simplesmente expira sozinho e as notificações passam pro novo.
import { randomUUID } from "node:crypto";
import { obterAccessTokenGoogle } from "../lib/integrations/google";

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url || !url.startsWith("https://")) {
    throw new Error(
      "Informe a URL pública do webhook: npm run drive:watch -- https://SEU-DOMINIO/api/webhooks/drive"
    );
  }
  const token = process.env.DRIVE_WEBHOOK_TOKEN;
  if (!token) {
    throw new Error("DRIVE_WEBHOOK_TOKEN não definido no .env.local (veja .env.example)");
  }

  const accessToken = await obterAccessTokenGoogle();
  const cabecalhos = {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };

  // O watch de mudanças parte de um page token atual.
  const respostaPageToken = await fetch(
    "https://www.googleapis.com/drive/v3/changes/startPageToken",
    { headers: cabecalhos }
  );
  if (!respostaPageToken.ok) {
    throw new Error(`Drive retornou HTTP ${respostaPageToken.status} ao obter o startPageToken`);
  }
  const { startPageToken } = (await respostaPageToken.json()) as { startPageToken: string };

  const canalId = randomUUID();
  const respostaWatch = await fetch(
    `https://www.googleapis.com/drive/v3/changes/watch?pageToken=${encodeURIComponent(startPageToken)}`,
    {
      method: "POST",
      headers: cabecalhos,
      body: JSON.stringify({
        id: canalId,
        type: "web_hook",
        address: url,
        token,
      }),
    }
  );
  if (!respostaWatch.ok) {
    const corpo = await respostaWatch.text();
    throw new Error(`Drive retornou HTTP ${respostaWatch.status} ao criar o canal: ${corpo}`);
  }
  const canal = (await respostaWatch.json()) as { id: string; expiration?: string };

  console.log("Canal de notificação do Drive criado com sucesso.");
  console.log(`  Canal: ${canal.id}`);
  console.log(`  Destino: ${url}`);
  if (canal.expiration) {
    const expiraEm = new Date(Number(canal.expiration));
    console.log(`  Expira em: ${expiraEm.toISOString()}`);
    console.log("  Lembre de rodar este script de novo antes da expiração.");
  }
}

main().catch((erro: unknown) => {
  console.error(
    `Configuração do canal falhou: ${erro instanceof Error ? erro.message : String(erro)}`
  );
  process.exit(1);
});
