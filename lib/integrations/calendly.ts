import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";

/**
 * Client Calendly (agendamentos) — conta Calendly da Adriana.
 * Credenciais via ambiente.
 */

const BASE_URL = "https://api.calendly.com";

/** Eventos que assinamos no Calendly. */
export const EVENTOS_CALENDLY = ["invitee.created", "invitee.canceled"] as const;

async function calendlyFetch(caminho: string, init: RequestInit = {}): Promise<Response> {
  const token = requireEnv("CALENDLY_API_TOKEN");
  return fetch(`${BASE_URL}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

/** Retorna os dados do usuário Calendly autenticado (conta da Adriana). */
export async function usuarioAtual(): Promise<unknown> {
  const resposta = await calendlyFetch("/users/me");
  if (!resposta.ok) {
    throw new Error(`Calendly: falha ao buscar usuário atual (HTTP ${resposta.status}).`);
  }
  return resposta.json();
}

export interface CriarSubscriptionParams {
  /** URL pública que receberá os webhooks (ex: https://app/api/webhooks/calendly). */
  url: string;
  /** URI da organização (obtida em /users/me → current_organization). */
  organization: string;
  /** URI do usuário — obrigatório quando scope = "user". */
  user?: string;
  /** "organization" ou "user". */
  scope: "organization" | "user";
  /** Eventos a assinar. Default: EVENTOS_CALENDLY. */
  events?: readonly string[];
}

export interface WebhookSubscription {
  uri: string;
  callback_url: string;
  /** Chave usada para validar a assinatura HMAC dos webhooks. GUARDE isto. */
  signing_key: string;
  state: string;
  events: string[];
}

/**
 * Cria a webhook subscription no Calendly e retorna o recurso, incluindo o
 * `signing_key` — que deve ser guardado em CALENDLY_WEBHOOK_SIGNING_KEY e é o
 * que valida a assinatura de cada webhook recebido.
 */
export async function criarWebhookSubscription(
  params: CriarSubscriptionParams,
): Promise<WebhookSubscription> {
  const corpo: Record<string, unknown> = {
    url: params.url,
    events: [...(params.events ?? EVENTOS_CALENDLY)],
    organization: params.organization,
    scope: params.scope,
  };
  if (params.scope === "user") {
    if (!params.user) {
      throw new Error("Calendly: scope 'user' exige o parâmetro user (uri do usuário).");
    }
    corpo.user = params.user;
  }

  const resposta = await calendlyFetch("/webhook_subscriptions", {
    method: "POST",
    body: JSON.stringify(corpo),
  });
  if (!resposta.ok) {
    const detalhe = await resposta.text();
    throw new Error(
      `Calendly: falha ao criar webhook subscription (HTTP ${resposta.status}): ${detalhe}`,
    );
  }
  const json = (await resposta.json()) as { resource: WebhookSubscription };
  return json.resource;
}

/**
 * Valida o header `Calendly-Webhook-Signature` (HMAC-SHA256).
 *
 * Formato do header: "t=<unix_ts>,v1=<hex>". A assinatura esperada é
 * HMAC_SHA256(signingKey, `${t}.${rawBody}`). Comparação em tempo constante.
 * Também rejeita timestamps fora de uma tolerância (anti-replay).
 */
export function validarAssinaturaCalendly(
  header: string | null,
  rawBody: string,
  signingKey: string,
  toleranciaSegundos = 300,
): boolean {
  if (!header) return false;

  const partes: Record<string, string> = {};
  for (const par of header.split(",")) {
    const [chave, valor] = par.split("=");
    if (chave && valor) partes[chave.trim()] = valor.trim();
  }
  const t = partes.t;
  const v1 = partes.v1;
  if (!t || !v1) return false;

  // Anti-replay: timestamp recente.
  const idadeSegundos = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(idadeSegundos) || idadeSegundos > toleranciaSegundos) {
    return false;
  }

  const esperado = createHmac("sha256", signingKey)
    .update(`${t}.${rawBody}`)
    .digest("hex");

  const bufA = Buffer.from(v1, "hex");
  const bufB = Buffer.from(esperado, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
