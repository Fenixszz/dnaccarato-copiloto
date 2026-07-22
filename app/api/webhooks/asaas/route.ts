import { NextResponse } from "next/server";
import { registrarErroDeRota } from "@/lib/log";
import { eventoAsaasSchema } from "@/lib/validation/asaas";
import { processarEventoAsaas } from "@/lib/webhooks/asaas";
import { tokenValido } from "@/lib/webhooks/autenticacao";
import { lerCorpoJson } from "@/lib/webhooks/validacao";

const ROTA = "/api/webhooks/asaas";

// Autenticação conforme a documentação do Asaas: o header asaas-access-token
// deve bater com o token definido ao cadastrar o webhook.

export async function POST(request: Request) {
  const segredo = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!segredo) {
    registrarErroDeRota(
      { rota: ROTA },
      new Error("ASAAS_WEBHOOK_TOKEN não configurado (veja .env.example)")
    );
    return NextResponse.json({ erro: "Webhook não configurado" }, { status: 500 });
  }
  if (!tokenValido(request.headers.get("asaas-access-token"), segredo)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const leitura = await lerCorpoJson(request);
  if (!leitura.sucesso) {
    return NextResponse.json({ erro: leitura.erro }, { status: 400 });
  }

  const validacao = eventoAsaasSchema.safeParse(leitura.corpo);
  if (!validacao.success) {
    const detalhes = validacao.error.issues
      .map((problema) => `${problema.path.join(".")}: ${problema.message}`)
      .join("; ");
    return NextResponse.json(
      { erro: `Payload inválido para webhook do Asaas: ${detalhes}` },
      { status: 400 }
    );
  }

  try {
    const resultado = await processarEventoAsaas(validacao.data, leitura.corpo);
    // 200 rápido: o Asaas pausa a fila de webhooks se a resposta demorar ou
    // falhar repetidamente.
    return NextResponse.json({ recebido: true, resumo: resultado.resumo });
  } catch (erro) {
    registrarErroDeRota({ rota: ROTA, resumo: `evento ${validacao.data.id}` }, erro);
    // 500 sem marcar como processado: o Asaas reentrega o evento depois.
    return NextResponse.json({ erro: "Erro interno ao processar o evento" }, { status: 500 });
  }
}
