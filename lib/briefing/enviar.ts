import { gerarBriefing } from "@/lib/briefing/priorizar";
import { obterSupabase } from "@/lib/db/supabase";
import { enviarMensagemWhatsApp, formatarNumeroWhatsApp } from "@/lib/whatsapp/evolution";

// Execução do briefing diário: gera a mensagem priorizada e envia pro
// WhatsApp da Adriana, com dedupe por dia em briefings_enviados — se o cron
// disparar duas vezes, o segundo disparo é ignorado (a chave_alerta é única
// também a nível de banco).

export type ResultadoBriefing = {
  enviado: boolean;
  resumo: string;
};

export async function executarBriefingDiario(): Promise<ResultadoBriefing> {
  const numeroBruto = process.env.ADRIANA_WHATSAPP;
  if (!numeroBruto) {
    throw new Error("ADRIANA_WHATSAPP não configurado (veja .env.example)");
  }
  const numero = formatarNumeroWhatsApp(numeroBruto);
  if (!numero) {
    throw new Error(`ADRIANA_WHATSAPP não é um número válido: ${numeroBruto}`);
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const chaveDoDia = `briefing_diario:${hoje}`;

  const { data: jaEnviado, error: erroConsulta } = await obterSupabase()
    .from("briefings_enviados")
    .select("id")
    .eq("chave_alerta", chaveDoDia)
    .maybeSingle();
  if (erroConsulta) {
    throw new Error(`Falha ao consultar briefings_enviados: ${erroConsulta.message}`);
  }
  if (jaEnviado) {
    return { enviado: false, resumo: `briefing de ${hoje} já enviado, disparo repetido ignorado` };
  }

  // "Tudo em dia" também é enviado: a ausência do briefing deve significar
  // problema técnico, nunca ambiguidade.
  const briefing = await gerarBriefing();
  await enviarMensagemWhatsApp(numero, briefing.mensagem);

  const { error: erroRegistro } = await obterSupabase().from("briefings_enviados").insert({
    tipo: "briefing_diario",
    chave_alerta: chaveDoDia,
    conteudo: briefing.mensagem,
    aluna_id: null,
  });
  if (erroRegistro) {
    // A mensagem já saiu; sem o registro, o dedupe do dia falha. Estoura pra
    // rota responder 500 e o problema ficar visível no painel do cron.
    throw new Error(`Briefing enviado, mas falhou ao registrar: ${erroRegistro.message}`);
  }

  return {
    enviado: true,
    resumo: `briefing de ${hoje} enviado (${briefing.furos.length} pendência(s), ${briefing.itens.length} no resumo)`,
  };
}
