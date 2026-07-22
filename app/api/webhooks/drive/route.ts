import { NextResponse } from "next/server";
import { registrarErroDeRota } from "@/lib/log";
import { notificacaoDriveSchema } from "@/lib/validation/drive";
import { tokenValido } from "@/lib/webhooks/autenticacao";
import { processarNotificacaoDrive } from "@/lib/webhooks/drive";

const ROTA = "/api/webhooks/drive";

// Notificação push do Google Drive (canal criado por npm run drive:watch).
// Não há corpo: a informação vem nos headers X-Goog-*; a autenticação é o
// X-Goog-Channel-Token, que definimos ao criar o canal.
export async function POST(request: Request) {
  const segredo = process.env.DRIVE_WEBHOOK_TOKEN;
  if (!segredo) {
    registrarErroDeRota(
      { rota: ROTA },
      new Error("DRIVE_WEBHOOK_TOKEN não configurado (veja .env.example)")
    );
    return NextResponse.json({ erro: "Webhook não configurado" }, { status: 500 });
  }
  if (!tokenValido(request.headers.get("x-goog-channel-token"), segredo)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const notificacao = {
    canal_id: request.headers.get("x-goog-channel-id"),
    estado: request.headers.get("x-goog-resource-state"),
    numero_mensagem: request.headers.get("x-goog-message-number"),
    recurso_id: request.headers.get("x-goog-resource-id"),
  };
  const validacao = notificacaoDriveSchema.safeParse(notificacao);
  if (!validacao.success) {
    const detalhes = validacao.error.issues
      .map((problema) => `${problema.path.join(".")}: ${problema.message}`)
      .join("; ");
    return NextResponse.json(
      { erro: `Notificação inválida do Drive: ${detalhes}` },
      { status: 400 }
    );
  }

  try {
    const resultado = await processarNotificacaoDrive(validacao.data, notificacao);
    return NextResponse.json({ recebido: true, resumo: resultado.resumo });
  } catch (erro) {
    registrarErroDeRota({ rota: ROTA, resumo: `mensagem ${validacao.data.numero_mensagem}` }, erro);
    // 500 sem marcar como processado: o Drive reenvia a notificação depois.
    return NextResponse.json({ erro: "Erro interno ao processar a notificação" }, { status: 500 });
  }
}
