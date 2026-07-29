import { requireEnv } from "@/lib/env";

/**
 * Client Calendly (agendamentos) — conta Calendly da Adriana.
 * Credenciais via ambiente. Esqueleto para as próximas fases.
 */

const BASE_URL = "https://api.calendly.com";

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
