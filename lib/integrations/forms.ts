import { obterAccessToken } from "@/lib/integrations/google-auth";

/**
 * Client Google Forms — projeto Google Cloud da Adriana.
 * Esqueleto para as próximas fases.
 */

const API_BASE = "https://forms.googleapis.com/v1";

/** Lista as respostas de um formulário pelo id. */
export async function listarRespostas(formId: string): Promise<unknown> {
  const token = await obterAccessToken();
  const resposta = await fetch(
    `${API_BASE}/forms/${encodeURIComponent(formId)}/responses`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resposta.ok) {
    throw new Error(`Forms: falha ao listar respostas (HTTP ${resposta.status}).`);
  }
  return resposta.json();
}
