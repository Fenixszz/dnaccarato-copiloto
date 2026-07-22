import { obterSupabase } from "@/lib/db/supabase";
import type { ServicoWebhook } from "@/lib/validation/webhooks";

// Dedupe de eventos de webhook: todo evento tem um identificador externo
// único (id do evento no serviço de origem) e é checado aqui ANTES de
// qualquer processamento. Além desta checagem, o UNIQUE (origem,
// evento_id_externo) na tabela garante a idempotência a nível de banco.
export async function eventoJaProcessado(
  origem: ServicoWebhook,
  eventoIdExterno: string
): Promise<boolean> {
  const { data, error } = await obterSupabase()
    .from("eventos_processados")
    .select("id")
    .eq("origem", origem)
    .eq("evento_id_externo", eventoIdExterno)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao consultar eventos_processados: ${error.message}`);
  }
  return data !== null;
}

export async function registrarEventoProcessado(
  origem: ServicoWebhook,
  eventoIdExterno: string,
  resultado: string
): Promise<void> {
  const { error } = await obterSupabase().from("eventos_processados").insert({
    origem,
    evento_id_externo: eventoIdExterno,
    resultado,
  });
  if (error) {
    throw new Error(`Falha ao registrar evento processado: ${error.message}`);
  }
}
