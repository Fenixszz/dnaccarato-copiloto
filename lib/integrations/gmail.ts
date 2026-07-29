import { obterAccessToken } from "@/lib/integrations/google-auth";

/**
 * Client Gmail — projeto Google Cloud da Adriana.
 * Esqueleto para as próximas fases.
 */

const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Lista ids de mensagens que casam com uma query do Gmail. */
export async function listarMensagens(query: string): Promise<unknown> {
  const token = await obterAccessToken();
  const resposta = await fetch(`${API_BASE}/messages?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resposta.ok) {
    throw new Error(`Gmail: falha ao listar mensagens (HTTP ${resposta.status}).`);
  }
  return resposta.json();
}
