import { obterAccessToken } from "@/lib/integrations/google-auth";

/**
 * Client Google Drive — projeto Google Cloud da Adriana.
 * Esqueleto para as próximas fases.
 */

const API_BASE = "https://www.googleapis.com/drive/v3";

/** Busca metadados de um arquivo do Drive pelo id. */
export async function metadadosArquivo(fileId: string): Promise<unknown> {
  const token = await obterAccessToken();
  const resposta = await fetch(
    `${API_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resposta.ok) {
    throw new Error(
      `Drive: falha ao buscar arquivo ${fileId} (HTTP ${resposta.status}).`,
    );
  }
  return resposta.json();
}
