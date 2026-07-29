import { requireEnv, optionalEnv } from "@/lib/env";

/**
 * Client Asaas (pagamentos/cobranças) — conta Asaas da Adriana.
 * Credenciais via ambiente. Esqueleto: métodos concretos entram por sub-fase.
 */

function baseUrl(): string {
  return optionalEnv("ASAAS_API_URL", "https://sandbox.asaas.com/api/v3").replace(
    /\/$/,
    "",
  );
}

async function asaasFetch(caminho: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = requireEnv("ASAAS_API_KEY");
  return fetch(`${baseUrl()}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey,
      ...(init.headers ?? {}),
    },
  });
}

/** Busca uma cobrança pelo id. Retorna o JSON bruto da API. */
export async function buscarCobranca(id: string): Promise<unknown> {
  const resposta = await asaasFetch(`/payments/${encodeURIComponent(id)}`);
  if (!resposta.ok) {
    throw new Error(`Asaas: falha ao buscar cobrança ${id} (HTTP ${resposta.status}).`);
  }
  return resposta.json();
}
