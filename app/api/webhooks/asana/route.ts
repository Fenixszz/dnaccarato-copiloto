import { NextResponse } from "next/server";
import { comTratamentoDeErro, logarErro, validarJson } from "@/lib/webhooks/validation";
import { jaProcessado, marcarProcessado } from "@/lib/webhooks/idempotency";
import { asanaWebhookSchema, type AsanaEvento } from "@/lib/validation/schemas";
import { validarAssinaturaAsana, buscarTask } from "@/lib/integrations/asana";
import { getServiceClient } from "@/lib/db/client";
import { lerEstado, salvarEstado } from "@/lib/db/queries";
import type { Json } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const ORIGEM = "asana";
const CHAVE_SECRET = "asana_hook_secret";
type SupabaseServer = ReturnType<typeof getServiceClient>;

/**
 * Webhook da Asana (tasks) — projeto/workspace da Adriana.
 *
 * Dois fluxos:
 *  A) HANDSHAKE — a Asana manda um POST com header X-Hook-Secret (síncrono,
 *     enquanto a criação do webhook está em andamento). Guardamos o secret e
 *     ecoamos o MESMO header de volta, respondendo 200.
 *  B) EVENTO — requisições seguintes trazem um batch { events: [...] } assinado
 *     com HMAC-SHA256 (header X-Hook-Signature) usando aquele secret.
 *
 * Fluxo do evento (CLAUDE.md): assinatura → Zod → eventos_brutos → por evento:
 * idempotência (gid+action+resource.gid+created_at) → atualiza tasks_asana.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rota = "POST /api/webhooks/asana";

  return comTratamentoDeErro({ rota }, async () => {
    // A) Handshake: guarda o secret e ecoa de volta.
    const hookSecret = request.headers.get("x-hook-secret");
    if (hookSecret) {
      await salvarEstado(CHAVE_SECRET, { secret: hookSecret });
      return new NextResponse(null, {
        status: 200,
        headers: { "X-Hook-Secret": hookSecret },
      });
    }

    // B) Evento assinado.
    const rawBody = await request.text();

    const estado = (await lerEstado(CHAVE_SECRET)) as { secret?: string } | null;
    const secret = estado?.secret;
    if (!secret) {
      logarErro(new Error("Webhook Asana sem secret (handshake não concluído)"), {
        rota,
      });
      return NextResponse.json({ erro: "Webhook não inicializado." }, { status: 401 });
    }

    if (
      !validarAssinaturaAsana(request.headers.get("x-hook-signature"), rawBody, secret)
    ) {
      logarErro(new Error("Assinatura Asana inválida"), { rota });
      return NextResponse.json({ erro: "Assinatura inválida." }, { status: 401 });
    }

    const validado = validarJson(rawBody, asanaWebhookSchema, { rota });
    if (!validado.ok) return validado.resposta;
    const { events } = validado.data;

    const db = getServiceClient();

    // Payload cru do batch (uma vez por requisição).
    const { error: eBruto } = await db.from("eventos_brutos").insert({
      origem: ORIGEM,
      payload: validado.data as unknown as Json,
    });
    if (eBruto) throw new Error(`Falha ao salvar evento bruto: ${eBruto.message}`);

    let processados = 0;
    let ignorados = 0;
    let atualizados = 0;
    for (const evento of events) {
      const chave = chaveEvento(evento);
      if (await jaProcessado(ORIGEM, chave)) {
        ignorados += 1;
        continue;
      }
      const mudou = await tratarEvento(db, evento);
      await marcarProcessado(ORIGEM, chave);
      processados += 1;
      if (mudou) atualizados += 1;
    }

    return NextResponse.json({
      status: "processado",
      processados,
      ignorados,
      atualizados,
    });
  });
}

/**
 * Chave de idempotência do evento. A Asana não tem um event_id único simples,
 * então combinamos resource.gid + action + campo alterado + created_at (o
 * created_at desempata mudanças repetidas do mesmo campo no mesmo recurso).
 */
function chaveEvento(evento: AsanaEvento): string {
  const campo = evento.change?.field ?? "-";
  const quando = evento.created_at ?? "";
  return `${evento.resource.gid}:${evento.action}:${campo}:${quando}`;
}

/**
 * Atualiza tasks_asana conforme o evento. Só mexe em tasks JÁ rastreadas
 * (linkadas a uma aluna); eventos de tasks desconhecidas são ignorados (não há
 * como associar uma aluna a partir do evento). Retorna true se atualizou.
 */
async function tratarEvento(db: SupabaseServer, evento: AsanaEvento): Promise<boolean> {
  if (evento.resource.resource_type !== "task") return false;
  const taskGid = evento.resource.gid;

  const { data, error } = await db
    .from("tasks_asana")
    .select("id")
    .eq("task_id", taskGid)
    .limit(1);
  if (error) throw new Error(`Falha ao buscar task rastreada: ${error.message}`);
  const existente = data?.[0];
  if (!existente) return false;

  if (evento.action === "deleted" || evento.action === "removed") {
    const { error: eUp } = await db
      .from("tasks_asana")
      .update({ status: "removida" })
      .eq("id", existente.id);
    if (eUp) throw new Error(`Falha ao atualizar task: ${eUp.message}`);
    return true;
  }

  if (evento.action === "changed" && evento.change?.field === "completed") {
    // A Asana não manda o valor novo de forma confiável — buscamos a task.
    const task = await buscarTask(taskGid);
    const patch = task.completed
      ? {
          status: "concluida",
          concluido_em:
            task.completed_at ?? evento.created_at ?? new Date().toISOString(),
        }
      : { status: "em_andamento", concluido_em: null };
    const { error: eUp } = await db
      .from("tasks_asana")
      .update(patch)
      .eq("id", existente.id);
    if (eUp) throw new Error(`Falha ao atualizar task: ${eUp.message}`);
    return true;
  }

  return false;
}
