import { NextResponse } from "next/server";
import { registrarErroDeRota } from "@/lib/log";
import { eventoFormsSchema } from "@/lib/validation/forms";
import { tokenValido } from "@/lib/webhooks/autenticacao";
import { processarEventoForms } from "@/lib/webhooks/forms";
import { lerCorpoJson } from "@/lib/webhooks/validacao";

const ROTA = "/api/webhooks/forms";

// Recebe as respostas do Google Form enviadas pelo nosso Apps Script
// (scripts/google-forms-webhook.gs), autenticadas pelo header x-forms-token.
export async function POST(request: Request) {
  const segredo = process.env.FORMS_WEBHOOK_TOKEN;
  if (!segredo) {
    registrarErroDeRota(
      { rota: ROTA },
      new Error("FORMS_WEBHOOK_TOKEN não configurado (veja .env.example)")
    );
    return NextResponse.json({ erro: "Webhook não configurado" }, { status: 500 });
  }
  if (!tokenValido(request.headers.get("x-forms-token"), segredo)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const leitura = await lerCorpoJson(request);
  if (!leitura.sucesso) {
    return NextResponse.json({ erro: leitura.erro }, { status: 400 });
  }

  const validacao = eventoFormsSchema.safeParse(leitura.corpo);
  if (!validacao.success) {
    const detalhes = validacao.error.issues
      .map((problema) => `${problema.path.join(".")}: ${problema.message}`)
      .join("; ");
    return NextResponse.json(
      { erro: `Payload inválido para webhook de formulários: ${detalhes}` },
      { status: 400 }
    );
  }

  try {
    const resultado = await processarEventoForms(validacao.data, leitura.corpo);
    return NextResponse.json({ recebido: true, resumo: resultado.resumo });
  } catch (erro) {
    registrarErroDeRota({ rota: ROTA, resumo: `resposta ${validacao.data.resposta_id}` }, erro);
    // 500 sem marcar como processado: a falha aparece em Execuções no Apps
    // Script e a resposta pode ser reenviada.
    return NextResponse.json({ erro: "Erro interno ao processar a resposta" }, { status: 500 });
  }
}
