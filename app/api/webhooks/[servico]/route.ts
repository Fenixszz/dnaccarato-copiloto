import { NextResponse } from "next/server";
import { comTratamentoDeErro, logarErro, validarCorpo } from "@/lib/webhooks/validation";
import { jaProcessado, marcarProcessado } from "@/lib/webhooks/idempotency";
import {
  extrairIdExterno,
  schemaPorServico,
  servicoWebhookSchema,
  type ServicoWebhook,
} from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * Rota genérica de ingestão de webhooks: /api/webhooks/[servico]
 *
 * Fluxo (segue CLAUDE.md):
 *  1. Valida que o serviço é conhecido.
 *  2. Valida o payload com o schema Zod do serviço → 400 se inválido.
 *  3. Extrai o identificador externo único e checa jaProcessado ANTES de
 *     qualquer escrita (idempotência). Duplicado → 200 e ignora.
 *  4. Processa (placeholder por enquanto).
 *  5. Só após processar com sucesso, marca o evento como processado.
 *  6. Qualquer exceção é capturada, logada com contexto e vira resposta HTTP.
 */
export async function POST(
  request: Request,
  { params }: { params: { servico: string } },
): Promise<NextResponse> {
  const rota = `POST /api/webhooks/${params.servico}`;

  return comTratamentoDeErro({ rota }, async () => {
    // 1. Serviço conhecido?
    const servicoParse = servicoWebhookSchema.safeParse(params.servico);
    if (!servicoParse.success) {
      return NextResponse.json(
        { erro: `Serviço de webhook desconhecido: ${params.servico}.` },
        { status: 404 },
      );
    }
    const servico: ServicoWebhook = servicoParse.data;

    // 2. Payload válido?
    const schema = schemaPorServico[servico];
    const validado = await validarCorpo(request, schema, { rota });
    if (!validado.ok) {
      return validado.resposta;
    }
    const payload = validado.data as Record<string, unknown>;

    // 3. Idempotência: checa ANTES de qualquer escrita.
    const idExterno = extrairIdExterno(servico, payload);
    if (idExterno === null) {
      logarErro(new Error("Evento sem identificador externo estável"), {
        rota,
        resumo: { servico, chaves: Object.keys(payload) },
      });
      return NextResponse.json(
        { erro: "Não foi possível determinar o identificador do evento." },
        { status: 400 },
      );
    }

    if (await jaProcessado(servico, idExterno)) {
      // Já processado antes — resposta idempotente de sucesso.
      return NextResponse.json({ status: "ignorado", motivo: "evento_duplicado" });
    }

    // 4. Processamento específico do serviço — placeholder por sub-fase futura.
    // TODO(fase-integracoes): despachar para o handler do serviço.

    // 5. Só marca como processado após o processamento ter dado certo.
    await marcarProcessado(servico, idExterno);

    return NextResponse.json({ status: "recebido", servico, idExterno });
  });
}
