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

/** Campos do cliente Asaas que usamos para casar/criar uma aluna. */
export interface ClienteAsaas {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
}

/**
 * Busca um cliente do Asaas pelo id (cus_...). O webhook de pagamento só traz
 * o id do cliente; e-mail/telefone/nome vêm daqui, para casar/criar a aluna.
 */
export async function buscarCliente(id: string): Promise<ClienteAsaas> {
  const resposta = await asaasFetch(`/customers/${encodeURIComponent(id)}`);
  if (!resposta.ok) {
    throw new Error(`Asaas: falha ao buscar cliente ${id} (HTTP ${resposta.status}).`);
  }
  return resposta.json() as Promise<ClienteAsaas>;
}

/**
 * Mapeia o status do pagamento no Asaas para o status de domínio usado em
 * `pagamentos.status` (português). Status desconhecido cai para minúsculas.
 */
export function mapearStatusAsaas(status: string): string {
  switch (status) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return "pago";
    case "PENDING":
    case "AWAITING_RISK_ANALYSIS":
      return "pendente";
    case "OVERDUE":
      return "atrasado";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
      return "estornado";
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
      return "chargeback";
    default:
      return status.toLowerCase();
  }
}
