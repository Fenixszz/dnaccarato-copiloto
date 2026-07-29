import { getServiceClient } from "@/lib/db/client";

/**
 * Idempotência de webhooks (CLAUDE.md).
 *
 * Todo webhook é idempotente: usa um identificador externo único do evento
 * para nunca processar o mesmo evento duas vezes. Antes de processar, tenta
 * registrar o evento na tabela `eventos_processados`. Se já existir, o evento
 * é duplicado e deve ser ignorado.
 *
 * A tabela `eventos_processados` deve ter uma restrição UNIQUE em
 * (servico, id_externo). O INSERT com conflito nessa chave é o mecanismo
 * atômico que garante o "exactly once".
 */

export interface RegistroEvento {
  /** Serviço de origem: "asaas" | "autentique" | "calendly" | ... */
  servico: string;
  /** Identificador único do evento no sistema de origem. */
  idExterno: string;
  /** Tipo/nome do evento na origem (ex: "PAYMENT_CONFIRMED"). */
  tipo?: string;
}

/**
 * Tenta reservar o evento para processamento.
 *
 * @returns `true` se o evento é novo (deve ser processado);
 *          `false` se já foi registrado antes (duplicado — ignorar).
 */
export async function reservarEvento(evento: RegistroEvento): Promise<boolean> {
  const db = getServiceClient();

  // Colunas conforme a migration eventos_processados: origem, evento_id_externo.
  // (A tabela não guarda "tipo"; o payload completo fica em eventos_brutos.)
  const { error } = await db.from("eventos_processados").insert({
    origem: evento.servico,
    evento_id_externo: evento.idExterno,
  });

  if (error === null) {
    // Insert bem-sucedido → evento inédito.
    return true;
  }

  // Código 23505 = unique_violation no Postgres → evento já registrado.
  if (error.code === "23505") {
    return false;
  }

  // Qualquer outro erro é inesperado e não deve ser engolido.
  throw new Error(
    `Falha ao registrar evento (${evento.servico}/${evento.idExterno}): ${error.message}`,
  );
}
