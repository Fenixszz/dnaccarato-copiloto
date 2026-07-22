import { obterSupabase } from "@/lib/db/supabase";

// Dedupe de webhooks. Contrato de TODA rota de webhook:
//   1. jaProcessado(origem, eventoId) ANTES de qualquer escrita;
//      se true, responde 200 sem reprocessar (entregas repetidas são normais).
//   2. processa o evento;
//   3. marcarProcessado(origem, eventoId) só DEPOIS do sucesso.
// Além desta checagem, o UNIQUE (origem, evento_id_externo) na tabela garante
// a idempotência a nível de banco em caso de corrida entre duas entregas.

export async function jaProcessado(origem: string, eventoId: string): Promise<boolean> {
  const { data, error } = await obterSupabase()
    .from("eventos_processados")
    .select("id")
    .eq("origem", origem)
    .eq("evento_id_externo", eventoId)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao consultar eventos_processados: ${error.message}`);
  }
  return data !== null;
}

export async function marcarProcessado(
  origem: string,
  eventoId: string,
  resultado?: string
): Promise<void> {
  const { error } = await obterSupabase()
    .from("eventos_processados")
    .insert({
      origem,
      evento_id_externo: eventoId,
      resultado: resultado ?? null,
    });
  if (error) {
    throw new Error(`Falha ao registrar evento processado: ${error.message}`);
  }
}
