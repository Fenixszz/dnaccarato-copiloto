import { NextResponse } from "next/server";
import { registrarErroDeRota } from "@/lib/log";
import { servicoWebhookSchema } from "@/lib/validation/webhooks";
import { lerCorpoJson } from "@/lib/webhooks/validacao";

// Ingestão de eventos externos (asaas, forms, calendly, drive, whatsapp).
// Fluxo por evento: validar → checar idempotência em eventos_processados
// (lib/webhooks/idempotency.ts) → processar → registrar. O processamento por
// serviço entra na fase de integrações.
export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/[servico]">) {
  const { servico } = await ctx.params;
  const servicoValidado = servicoWebhookSchema.safeParse(servico);
  if (!servicoValidado.success) {
    return NextResponse.json(
      { erro: `Serviço de webhook desconhecido: "${servico}"` },
      { status: 400 }
    );
  }

  const leitura = await lerCorpoJson(request);
  if (!leitura.sucesso) {
    return NextResponse.json({ erro: leitura.erro }, { status: 400 });
  }

  try {
    return NextResponse.json(
      { erro: `Ingestão de eventos do serviço "${servicoValidado.data}" ainda não implementada` },
      { status: 501 }
    );
  } catch (erro) {
    registrarErroDeRota({ rota: `/api/webhooks/${servicoValidado.data}` }, erro);
    return NextResponse.json({ erro: "Erro interno ao processar o evento" }, { status: 500 });
  }
}
