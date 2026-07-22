import { NextResponse } from "next/server";
import { registrarErroDeRota } from "@/lib/log";
import { eventoCalendlySchema } from "@/lib/validation/calendly";
import { assinaturaCalendlyValida, processarEventoCalendly } from "@/lib/webhooks/calendly";

const ROTA = "/api/webhooks/calendly";

export async function POST(request: Request) {
  const chaveDeAssinatura = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!chaveDeAssinatura) {
    registrarErroDeRota(
      { rota: ROTA },
      new Error("CALENDLY_WEBHOOK_SIGNING_KEY não configurada (veja .env.example)")
    );
    return NextResponse.json({ erro: "Webhook não configurado" }, { status: 500 });
  }

  // A assinatura cobre o corpo cru — ler como texto ANTES de qualquer parse.
  const corpoCru = await request.text();
  const cabecalho = request.headers.get("calendly-webhook-signature");
  if (!assinaturaCalendlyValida(cabecalho, corpoCru, chaveDeAssinatura)) {
    return NextResponse.json({ erro: "Assinatura inválida" }, { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(corpoCru);
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição não é JSON válido" }, { status: 400 });
  }

  const validacao = eventoCalendlySchema.safeParse(corpo);
  if (!validacao.success) {
    const detalhes = validacao.error.issues
      .map((problema) => `${problema.path.join(".")}: ${problema.message}`)
      .join("; ");
    return NextResponse.json(
      { erro: `Payload inválido para webhook do Calendly: ${detalhes}` },
      { status: 400 }
    );
  }

  try {
    const resultado = await processarEventoCalendly(validacao.data, corpo);
    // 200 rápido; o Calendly desativa subscriptions que falham demais.
    return NextResponse.json({ recebido: true, resumo: resultado.resumo });
  } catch (erro) {
    registrarErroDeRota({ rota: ROTA, resumo: `evento ${validacao.data.event}` }, erro);
    // 500 sem marcar como processado: o Calendly reenvia o evento depois.
    return NextResponse.json({ erro: "Erro interno ao processar o evento" }, { status: 500 });
  }
}
