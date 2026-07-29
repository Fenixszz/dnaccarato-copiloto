import { requireEnv } from "@/lib/env";

/**
 * Client Asana (gestão de tarefas/projetos) — conta Asana da Adriana.
 * Credenciais via ambiente. Esqueleto para as próximas fases.
 */

const BASE_URL = "https://app.asana.com/api/1.0";

async function asanaFetch(caminho: string, init: RequestInit = {}): Promise<Response> {
  const token = requireEnv("ASANA_ACCESS_TOKEN");
  return fetch(`${BASE_URL}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

/** Retorna os dados do usuário Asana autenticado (conta da Adriana). */
export async function usuarioAtual(): Promise<unknown> {
  const resposta = await asanaFetch("/users/me");
  if (!resposta.ok) {
    throw new Error(`Asana: falha ao buscar usuário atual (HTTP ${resposta.status}).`);
  }
  return resposta.json();
}
