import { requireEnv } from "@/lib/env";

/**
 * Autenticação OAuth compartilhada dos serviços Google — projeto Google Cloud
 * da Adriana. Usada por Drive, Gmail, Agenda (Calendar) e Forms.
 *
 * Troca o refresh token de longa duração por um access token de curta duração.
 * Esqueleto: cache/refresh mais robusto entra em sub-fase futura.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export async function obterAccessToken(): Promise<string> {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    refresh_token: requireEnv("GOOGLE_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });

  const resposta = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!resposta.ok) {
    throw new Error(
      `Google OAuth: falha ao renovar access token (HTTP ${resposta.status}).`,
    );
  }

  const corpo = (await resposta.json()) as { access_token?: string };
  if (typeof corpo.access_token !== "string") {
    throw new Error("Google OAuth: resposta sem access_token.");
  }
  return corpo.access_token;
}
