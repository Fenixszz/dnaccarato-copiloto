import { NextResponse } from "next/server";
import { comTratamentoDeErro, logarErro } from "@/lib/webhooks/validation";
import { jaProcessado, marcarProcessado } from "@/lib/webhooks/idempotency";
import { requireEnv } from "@/lib/env";
import { getServiceClient } from "@/lib/db/client";
import { lerEstado, salvarEstado } from "@/lib/db/queries";
import { coletarNovosMateriais, getStartPageToken } from "@/lib/integrations/drive";
import { acharAlunaPorNomePasta, upsertMaterial } from "@/lib/materiais";
import type { Json } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const ORIGEM = "drive";
const CHAVE_PAGE_TOKEN = "drive_page_token";

/**
 * Webhook de push notifications do Google Drive — pasta raiz da Adriana.
 *
 * A notificação do Drive NÃO traz o payload: chega um "ping" (headers X-Goog-*)
 * e nós lemos as mudanças via changes.list a partir do pageToken guardado.
 *
 * Fluxo (CLAUDE.md):
 *  1. Autentica pelo header X-Goog-Channel-Token (== DRIVE_CHANNEL_TOKEN) → 401.
 *  2. Ignora o handshake inicial (resourceState "sync").
 *  3. Idempotência por canal+número da mensagem.
 *  4. Salva os headers em eventos_brutos.
 *  5. Lê as mudanças; para cada arquivo novo numa subpasta da raiz, casa a aluna
 *     pelo NOME da subpasta (motor de matching) e grava em `materiais`.
 *
 * Não infere assinatura de documento — isso é papel exclusivo da Autentique.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rota = "POST /api/webhooks/drive";

  return comTratamentoDeErro({ rota }, async () => {
    // 1. Autenticação via channel token.
    if (
      request.headers.get("x-goog-channel-token") !== requireEnv("DRIVE_CHANNEL_TOKEN")
    ) {
      logarErro(new Error("X-Goog-Channel-Token ausente ou inválido"), { rota });
      return NextResponse.json({ erro: "Canal inválido." }, { status: 401 });
    }

    const resourceState = request.headers.get("x-goog-resource-state") ?? "";
    const channelId = request.headers.get("x-goog-channel-id") ?? "";
    const messageNumber = request.headers.get("x-goog-message-number") ?? "";
    const resourceId = request.headers.get("x-goog-resource-id") ?? "";

    // 2. Handshake inicial: só confirma.
    if (resourceState === "sync") {
      return NextResponse.json({ status: "sync_ok" });
    }

    // 3. Idempotência: cada mensagem do canal tem um número único.
    const chaveEvento = `${channelId}:${messageNumber}`;
    if (await jaProcessado(ORIGEM, chaveEvento)) {
      return NextResponse.json({ status: "ignorado", motivo: "evento_duplicado" });
    }

    const db = getServiceClient();

    // 4. Payload cru (o Drive não manda corpo; guardamos os headers).
    const { error: eBruto } = await db.from("eventos_brutos").insert({
      origem: ORIGEM,
      payload: { resourceState, channelId, messageNumber, resourceId } as Json,
    });
    if (eBruto) throw new Error(`Falha ao salvar evento bruto: ${eBruto.message}`);

    // 5a. pageToken. Se ainda não há, inicializa e sai (nada a processar agora).
    const estado = (await lerEstado(CHAVE_PAGE_TOKEN)) as { pageToken?: string } | null;
    if (!estado?.pageToken) {
      const inicial = await getStartPageToken();
      await salvarEstado(CHAVE_PAGE_TOKEN, { pageToken: inicial });
      await marcarProcessado(ORIGEM, chaveEvento);
      return NextResponse.json({ status: "inicializado" });
    }

    // 5b. Lê mudanças e grava materiais das subpastas identificadas.
    const { novoPageToken, itens } = await coletarNovosMateriais(estado.pageToken);

    const { data: alunas, error: eAlunas } = await db.from("alunas").select("id, nome");
    if (eAlunas) throw new Error(`Falha ao carregar alunas: ${eAlunas.message}`);
    const listaAlunas = alunas ?? [];

    const naoIdentificadas = new Set<string>();
    let gravados = 0;
    for (const item of itens) {
      const alunaId = acharAlunaPorNomePasta(listaAlunas, item.subpastaNome);
      if (!alunaId) {
        naoIdentificadas.add(item.subpastaNome);
        continue;
      }
      await upsertMaterial(db, alunaId, item);
      gravados += 1;
    }

    // Avança o cursor e marca a mensagem como processada.
    await salvarEstado(CHAVE_PAGE_TOKEN, { pageToken: novoPageToken });
    await marcarProcessado(ORIGEM, chaveEvento);

    return NextResponse.json({
      status: "processado",
      gravados,
      nao_identificadas: [...naoIdentificadas],
    });
  });
}
