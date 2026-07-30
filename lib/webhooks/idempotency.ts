import { getServiceClient } from "@/lib/db/client";

/**
 * Idempotência de webhooks (CLAUDE.md).
 *
 * Todo webhook das próximas sub-fases usa este helper:
 *   1. Checa `jaProcessado(origem, eventoId)` ANTES de qualquer escrita.
 *      Se true, ignora o evento (é repetição) e não processa de novo.
 *   2. Processa o evento.
 *   3. Só DEPOIS de processar com sucesso, chama `marcarProcessado`.
 *
 * A tabela `eventos_processados` tem UNIQUE(origem, evento_id_externo). Esse
 * índice é a garantia real de "exactly once": mesmo que dois eventos idênticos
 * cheguem em paralelo e ambos passem por `jaProcessado`, o segundo INSERT em
 * `marcarProcessado` colide na chave única — e nós tratamos essa colisão como
 * "já marcado", sem erro (é idempotente por definição).
 */

/** Retorna true se (origem, eventoId) já foi processado antes. */
export async function jaProcessado(origem: string, eventoId: string): Promise<boolean> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("eventos_processados")
    .select("id")
    .eq("origem", origem)
    .eq("evento_id_externo", eventoId)
    .limit(1);

  if (error) {
    throw new Error(
      `Falha ao checar idempotência (${origem}/${eventoId}): ${error.message}`,
    );
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Marca (origem, eventoId) como processado. Chamar SÓ após processar com
 * sucesso. Uma segunda marcação do mesmo evento (corrida) é tolerada — a
 * colisão na chave única não é erro, é o comportamento idempotente esperado.
 */
export async function marcarProcessado(origem: string, eventoId: string): Promise<void> {
  const db = getServiceClient();
  const { error } = await db
    .from("eventos_processados")
    .insert({ origem, evento_id_externo: eventoId });

  if (!error) return;

  // 23505 = unique_violation → já estava marcado. Idempotente, não é erro.
  if (error.code === "23505") return;

  throw new Error(
    `Falha ao marcar evento como processado (${origem}/${eventoId}): ${error.message}`,
  );
}
