import { requireEnv } from "@/lib/env";

/**
 * Client Autentique (assinatura de documentos) — conta Autentique da Adriana.
 * API é GraphQL. Credenciais via ambiente. Esqueleto para as próximas fases.
 */

const ENDPOINT = "https://api.autentique.com.br/v2/graphql";

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
