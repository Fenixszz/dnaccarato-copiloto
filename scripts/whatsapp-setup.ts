/**
 * Configura a instância da Evolution API (Baileys/QR) e o webhook de eventos.
 *
 * Uso:  npm run whatsapp:setup
 * Requer no .env: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE e
 * NEXT_PUBLIC_APP_URL (pública, para o webhook ser alcançável).
 *
 * Passos (idempotente):
 *  1. Garante a instância (cria com integration WHATSAPP-BAILEYS + qrcode se não existir).
 *  2. Configura o webhook apontando para <APP_URL>/api/webhooks/whatsapp.
 *  3. Se a instância não estiver conectada, gera o QR (salva PNG e mostra o caminho).
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { optionalEnv, requireEnv } from "@/lib/env";

// O webhook do app só processa mensagens novas (event "messages.upsert").
// Manter só esse evento evita encher `eventos_brutos` com ruído ignorado.
const EVENTOS = ["MESSAGES_UPSERT"];

function baseUrl(): string {
  const url = requireEnv("EVOLUTION_API_URL").trim().replace(/\/$/, "");
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

async function api(
  caminho: string,
  init: RequestInit = {},
): Promise<{ status: number; json: unknown }> {
  const resposta = await fetch(`${baseUrl()}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: requireEnv("EVOLUTION_API_KEY"),
      ...(init.headers ?? {}),
    },
  });
  let json: unknown = null;
  try {
    json = await resposta.json();
  } catch {
    json = null;
  }
  return { status: resposta.status, json };
}

async function instanciaExiste(instancia: string): Promise<boolean> {
  const { json } = await api("/instance/fetchInstances");
  const lista = Array.isArray(json) ? json : [];
  return lista.some((it) => {
    const rec = it as Record<string, unknown>;
    const nome =
      rec.name ?? (rec.instance as Record<string, unknown> | undefined)?.instanceName;
    return nome === instancia;
  });
}

async function main(): Promise<void> {
  const instancia = requireEnv("EVOLUTION_INSTANCE");
  const appUrl = optionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const webhookUrl = `${appUrl}/api/webhooks/whatsapp`;

  // 1. Garante a instância.
  if (await instanciaExiste(instancia)) {
    console.log(`✓ Instância "${instancia}" já existe.`);
  } else {
    const criar = await api("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName: instancia,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      }),
    });
    if (criar.status >= 400) {
      throw new Error(`Falha ao criar instância: ${JSON.stringify(criar.json)}`);
    }
    console.log(`✓ Instância "${instancia}" criada.`);
  }

  // 2. Configura o webhook.
  if (appUrl.startsWith("http://localhost")) {
    console.warn(
      "⚠️  NEXT_PUBLIC_APP_URL é localhost — a Evolution (remota) não alcança o webhook.\n" +
        "    O webhook será gravado, mas só recebe eventos quando o app estiver público (HTTPS).",
    );
  }
  const setWebhook = await api(`/webhook/set/${instancia}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        base64: false,
        events: EVENTOS,
      },
    }),
  });
  if (setWebhook.status >= 400) {
    throw new Error(`Falha ao configurar webhook: ${JSON.stringify(setWebhook.json)}`);
  }
  console.log(`✓ Webhook configurado → ${webhookUrl}`);
  console.log(`  eventos: ${EVENTOS.join(", ")}`);

  // 3. Estado da conexão / QR.
  const estado = await api(`/instance/connectionState/${instancia}`);
  const state = (
    (estado.json as Record<string, unknown>)?.instance as
      Record<string, unknown> | undefined
  )?.state;
  if (state === "open") {
    console.log("✓ WhatsApp já conectado (state: open). Nada a escanear.");
    return;
  }

  const conectar = await api(`/instance/connect/${instancia}`);
  const dados = conectar.json as { base64?: string };
  if (dados.base64) {
    const b64 = dados.base64.replace(/^data:image\/\w+;base64,/, "");
    const arquivo = path.resolve("whatsapp-qr.png");
    writeFileSync(arquivo, Buffer.from(b64, "base64"));
    console.log(`📷 QR salvo em ${arquivo} — escaneie com o WhatsApp do número do João.`);
  } else {
    console.log("Sem QR na resposta (talvez já conectando). Rode de novo em instantes.");
  }
}

main().catch((erro: unknown) => {
  console.error("❌ Falhou:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
