import { perguntarAoCopiloto } from "@/lib/agente/copiloto";
import { obterSupabase } from "@/lib/db/supabase";
import type { Json } from "@/lib/db/types";
import { telefonesCorrespondem } from "@/lib/matching/contatos";
import { extrairTextoDaMensagem, type MensagemWhatsapp } from "@/lib/validation/whatsapp";
import { enviarComRetry } from "@/lib/whatsapp/envio";
import { formatarNumeroWhatsApp } from "@/lib/whatsapp/evolution";
import { jaProcessado, marcarProcessado } from "@/lib/webhooks/idempotency";

const ORIGEM = "whatsapp";

async function salvarEventoBruto(payloadCru: unknown): Promise<void> {
  const { error } = await obterSupabase()
    .from("eventos_brutos")
    .insert({
      origem: ORIGEM,
      payload: payloadCru as Json,
    });
  if (error) {
    throw new Error(`Falha ao salvar evento bruto: ${error.message}`);
  }
}

export type ResultadoProcessamento = {
  status: "duplicado" | "ignorado" | "processado";
  resumo: string;
};

// Fluxo de uma mensagem recebida no WhatsApp: só mensagens de TEXTO vindas
// DO NÚMERO DA ADRIANA disparam o agente — eco das nossas próprias mensagens
// (fromMe) e mensagens de outros números são ignorados. Erro em qualquer
// etapa estoura pra rota responder 500 SEM marcar como processado.
export async function processarMensagemWhatsApp(
  evento: MensagemWhatsapp,
  payloadCru: unknown
): Promise<ResultadoProcessamento> {
  if (evento.event !== "messages.upsert" || !evento.data) {
    return { status: "ignorado", resumo: `evento ${evento.event} ignorado (não é mensagem)` };
  }
  if (evento.data.key.fromMe) {
    return { status: "ignorado", resumo: "eco de mensagem nossa ignorado" };
  }

  const numeroRemetente = evento.data.key.remoteJid.split("@")[0];
  const numeroDaAdriana = process.env.ADRIANA_WHATSAPP;
  if (!numeroDaAdriana) {
    throw new Error("ADRIANA_WHATSAPP não configurado (veja .env.example)");
  }
  if (!telefonesCorrespondem(numeroRemetente, numeroDaAdriana)) {
    // Mensagens de alunas/terceiros pro número da clínica não disparam o
    // agente — o copiloto responde só à Adriana.
    return { status: "ignorado", resumo: "mensagem de outro número ignorada" };
  }

  const texto = extrairTextoDaMensagem(evento);
  if (texto === null) {
    return { status: "ignorado", resumo: "mensagem sem texto (mídia/figurinha) ignorada" };
  }

  const eventoId = evento.data.key.id;
  if (await jaProcessado(ORIGEM, eventoId)) {
    return { status: "duplicado", resumo: "mensagem já processada, entrega repetida ignorada" };
  }

  await salvarEventoBruto(payloadCru);

  const resposta = await perguntarAoCopiloto(texto);

  const numeroDestino = formatarNumeroWhatsApp(numeroRemetente);
  if (!numeroDestino) {
    throw new Error(`Número do remetente inválido: ${numeroRemetente}`);
  }
  await enviarComRetry(numeroDestino, resposta, {
    area: "whatsapp",
    contexto: "resposta à Adriana",
  });

  await marcarProcessado(ORIGEM, eventoId, `pergunta respondida (${texto.slice(0, 80)})`);
  return { status: "processado", resumo: "pergunta da Adriana respondida na mesma conversa" };
}
