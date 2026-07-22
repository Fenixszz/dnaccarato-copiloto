import { NextResponse } from "next/server";
import { registrarErroDeRota } from "@/lib/log";
import { mensagemWhatsappSchema } from "@/lib/validation/whatsapp";
import { tokenValido } from "@/lib/webhooks/autenticacao";
import { processarMensagemWhatsApp } from "@/lib/webhooks/whatsapp";
import { lerCorpoJson } from "@/lib/webhooks/validacao";

const ROTA = "/api/webhooks/whatsapp";

// A resposta do agente (Claude + tools MCP) pode levar dezenas de segundos.
export const maxDuration = 60;

// Recebe as mensagens da Evolution API (webhook configurado com o header
// x-evolution-token) e responde à Adriana na mesma conversa.
export async function POST(request: Request) {
  const segredo = process.env.EVOLUTION_WEBHOOK_TOKEN;
  if (!segredo) {
    registrarErroDeRota(
      { rota: ROTA },
      new Error("EVOLUTION_WEBHOOK_TOKEN não configurado (veja .env.example)")
    );
    return NextResponse.json({ erro: "Webhook não configurado" }, { status: 500 });
  }
  if (!tokenValido(request.headers.get("x-evolution-token"), segredo)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const leitura = await lerCorpoJson(request);
  if (!leitura.sucesso) {
    return NextResponse.json({ erro: leitura.erro }, { status: 400 });
  }

  const validacao = mensagemWhatsappSchema.safeParse(leitura.corpo);
  if (!validacao.success) {
    const detalhes = validacao.error.issues
      .map((problema) => `${problema.path.join(".")}: ${problema.message}`)
      .join("; ");
    return NextResponse.json(
      { erro: `Payload inválido para webhook do WhatsApp: ${detalhes}` },
      { status: 400 }
    );
  }

  try {
    const resultado = await processarMensagemWhatsApp(validacao.data, leitura.corpo);
    return NextResponse.json({ recebido: true, resumo: resultado.resumo });
  } catch (erro) {
    registrarErroDeRota(
      { rota: ROTA, resumo: `mensagem ${validacao.data.data?.key.id ?? "sem id"}` },
      erro
    );
    // 500 sem marcar como processado: reentrega reprocessa do zero.
    return NextResponse.json({ erro: "Erro interno ao processar a mensagem" }, { status: 500 });
  }
}
