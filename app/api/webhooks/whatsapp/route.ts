import { NextResponse } from "next/server";
import { comTratamentoDeErro, logarErro, validarCorpo } from "@/lib/webhooks/validation";
import { jaProcessado, marcarProcessado } from "@/lib/webhooks/idempotency";
import { whatsappWebhookSchema } from "@/lib/validation/schemas";
import { getServiceClient } from "@/lib/db/client";
import { requireEnv } from "@/lib/env";
import { enviarTexto } from "@/lib/whatsapp/client";
import { responderComMcp } from "@/lib/integrations/anthropic";
import { normalizarTelefone, telefonesCasam } from "@/lib/matching/matcher";
import type { Json } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const ORIGEM = "whatsapp";
const FALLBACK =
  "Tive um problema pra processar agora. Pode tentar de novo em instantes?";

/**
 * Webhook do WhatsApp (Evolution API): recebe as mensagens da Adriana, manda o
 * texto para a Anthropic no backend (a key nunca é exposta) com o conector MCP
 * apontando pro nosso servidor MCP, e responde na MESMA conversa do WhatsApp.
 *
 * Fluxo (CLAUDE.md): Zod → idempotência (id da mensagem) → eventos_brutos →
 * filtra (só messages.upsert, da Adriana, com texto, não enviada por nós) →
 * Anthropic+MCP → envia a resposta (via rate limiter).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rota = "POST /api/webhooks/whatsapp";

  return comTratamentoDeErro({ rota }, async () => {
    const validado = await validarCorpo(request, whatsappWebhookSchema, { rota });
    if (!validado.ok) return validado.resposta;
    const evento = validado.data;

    const data = asRecord(evento.data);
    const key = asRecord(data?.key);
    const idMsg = str(key?.id);

    // Idempotência pelo id da mensagem.
    if (idMsg && (await jaProcessado(ORIGEM, idMsg))) {
      return NextResponse.json({ status: "ignorado", motivo: "evento_duplicado" });
    }

    const db = getServiceClient();
    const { error: eBruto } = await db
      .from("eventos_brutos")
      .insert({ origem: ORIGEM, payload: evento as unknown as Json });
    if (eBruto) throw new Error(`Falha ao salvar evento bruto: ${eBruto.message}`);

    // Só respondemos a mensagens de texto da Adriana (não as nossas).
    const jid = str(key?.remoteJid) ?? "";
    const numero = normalizarTelefone(jid.split("@")[0] ?? "");
    const texto = extrairTexto(data);
    const adriana = normalizarTelefone(requireEnv("BRIEFING_WHATSAPP"));
    const ehMensagemNova = evento.event === "messages.upsert" && key?.fromMe !== true;
    const daAdriana = numero.length > 0 && telefonesCasam(numero, adriana);

    if (!ehMensagemNova || !texto || !daAdriana) {
      if (idMsg) await marcarProcessado(ORIGEM, idMsg);
      return NextResponse.json({ status: "ignorado" });
    }

    // Anthropic + MCP. Um erro aqui não pode derrubar o webhook — respondemos
    // com um fallback para a Adriana não ficar sem retorno.
    let resposta: string;
    try {
      resposta = await responderComMcp(texto);
    } catch (erro) {
      logarErro(erro, { rota, resumo: { etapa: "anthropic" } });
      resposta = FALLBACK;
    }

    // Responde na mesma conversa (via rate limiter, dentro de enviarTexto).
    await enviarTexto({ numero, texto: resposta });

    if (idMsg) await marcarProcessado(ORIGEM, idMsg);
    return NextResponse.json({ status: "respondido" });
  });
}

function asRecord(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function str(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

/** Extrai o texto de uma mensagem do WhatsApp (conversation ou extendedText). */
function extrairTexto(data: Record<string, unknown> | null): string | null {
  const message = asRecord(data?.message);
  const conversa = str(message?.conversation);
  if (conversa) return conversa;
  const estendida = asRecord(message?.extendedTextMessage);
  return str(estendida?.text);
}
