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

export interface EmailResumo {
  id: string;
  assunto: string;
  trecho: string;
  data: string;
}

interface ListaMensagens {
  messages?: { id: string }[];
}
interface MensagemMetadata {
  snippet?: string;
  payload?: { headers?: { name: string; value: string }[] };
}

/**
 * Busca e-mails na caixa da Adriana (escopo readonly) por uma query do Gmail e
 * devolve assunto + trecho + data dos resultados mais relevantes.
 */
export async function buscarEmails(query: string, max = 5): Promise<EmailResumo[]> {
  const token = await obterAccessToken();
  const cabecalho = { Authorization: `Bearer ${token}` };

  const lista = await fetch(
    `${API_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=${max}`,
    { headers: cabecalho },
  );
  if (!lista.ok) {
    throw new Error(`Gmail: falha ao buscar mensagens (HTTP ${lista.status}).`);
  }
  const ids = (((await lista.json()) as ListaMensagens).messages ?? []).slice(0, max);

  const resultados: EmailResumo[] = [];
  for (const item of ids) {
    const resposta = await fetch(
      `${API_BASE}/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: cabecalho },
    );
    if (!resposta.ok) continue;
    const msg = (await resposta.json()) as MensagemMetadata;
    const headers = msg.payload?.headers ?? [];
    const cabecalhoDe = (nome: string): string =>
      headers.find((h) => h.name.toLowerCase() === nome)?.value ?? "";
    resultados.push({
      id: item.id,
      assunto: cabecalhoDe("subject") || "(sem assunto)",
      trecho: msg.snippet ?? "",
      data: cabecalhoDe("date"),
    });
  }
  return resultados;
}
