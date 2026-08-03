import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";

/**
 * Client Autentique (assinatura de documentos) — conta Autentique da Adriana.
 * API é GraphQL. Credenciais via ambiente.
 */

const ENDPOINT = "https://api.autentique.com.br/v2/graphql";

/**
 * Valida a assinatura HMAC-SHA256 do header `X-Autentique-Signature` sobre o
 * corpo CRU, usando o segredo do Developer Panel. Comparação em tempo constante
 * (timingSafeEqual) — nunca ==. Aceita header em hex puro ou "sha256=<hex>".
 */
export function validarAssinaturaAutentique(
  header: string | null,
  rawBody: string,
  secret: string,
): boolean {
  if (!header) return false;

  const recebidoHex = header.startsWith("sha256=") ? header.slice(7) : header;
  const esperadoHex = createHmac("sha256", secret).update(rawBody).digest("hex");

  const recebido = Buffer.from(recebidoHex, "hex");
  const esperado = Buffer.from(esperadoHex, "hex");
  if (recebido.length === 0 || recebido.length !== esperado.length) return false;
  return timingSafeEqual(recebido, esperado);
}

/** Executa uma query/mutation GraphQL contra a API da Autentique. */
export async function autentiqueGraphQL<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const token = requireEnv("AUTENTIQUE_API_TOKEN");
  const resposta = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!resposta.ok) {
    throw new Error(`Autentique: HTTP ${resposta.status}.`);
  }

  const corpo = (await resposta.json()) as { data?: T; errors?: unknown };
  if (corpo.errors !== undefined) {
    throw new Error(`Autentique: erro GraphQL — ${JSON.stringify(corpo.errors)}.`);
  }
  return corpo.data as T;
}
