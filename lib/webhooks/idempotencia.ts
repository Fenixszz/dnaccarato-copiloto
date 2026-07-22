import { obterSupabase } from "@/lib/db/supabase";
import type { ServicoWebhook } from "@/lib/validation/webhooks";

// Dedupe de eventos de webhook: todo evento tem um identificador externo
// único (id do evento no serviço de origem) e é checado aqui ANTES de
// qualquer processamento. A tabela eventos_processados é criada na fase de
// banco de dados.
export async function eventoJaProcessado(
  servico: ServicoWebhook,
  idExternoEvento: string
): Promise<boolean> {
  const { data, error } = await obterSupabase()
    .from("eventos_processados")
    .select("id")
    .eq("servico", servico)
    .eq("id_externo_evento", idExternoEvento)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao consultar eventos_processados: ${error.message}`);
  }
  return data !== null;
}

export async function registrarEventoProcessado(
  servico: ServicoWebhook,
  idExternoEvento: string,
  resultado: string
): Promise<void> {
  const { error } = await obterSupabase().from("eventos_processados").insert({
    servico,
    id_externo_evento: idExternoEvento,
    resultado,
  });
  if (error) {
    throw new Error(`Falha ao registrar evento processado: ${error.message}`);
  }
}
