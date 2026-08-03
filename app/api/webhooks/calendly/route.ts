import { NextResponse } from "next/server";
import { comTratamentoDeErro, logarErro, validarJson } from "@/lib/webhooks/validation";
import { jaProcessado, marcarProcessado } from "@/lib/webhooks/idempotency";
import { calendlyEventoSchema, type CalendlyEvento } from "@/lib/validation/schemas";
import { validarAssinaturaCalendly } from "@/lib/integrations/calendly";
import { requireEnv } from "@/lib/env";
import { getServiceClient } from "@/lib/db/client";
import type { Json, TablesInsert } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const ORIGEM = "calendly";
type SupabaseServer = ReturnType<typeof getServiceClient>;

/**
 * Webhook do Calendly (invitee.created / invitee.canceled) — conta da Adriana.
 *
 * Fluxo (CLAUDE.md):
 *  1. Valida a assinatura HMAC do header `Calendly-Webhook-Signature` com o
 *     CALENDLY_WEBHOOK_SIGNING_KEY (retornado ao criar a subscription) → 401.
 *  2. Valida o payload com Zod → 400.
 *  3. Idempotência por `${event}:${invitee_uri}` (created e canceled do mesmo
 *     invitee são eventos distintos e ambos devem processar).
 *  4. Salva o payload cru em eventos_brutos.
 *  5. Casa/cria a aluna (email do invitee) e grava/atualiza em `reunioes`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rota = "POST /api/webhooks/calendly";

  return comTratamentoDeErro({ rota }, async () => {
    // Corpo cru primeiro — a assinatura HMAC é sobre os bytes recebidos.
    const rawBody = await request.text();

    // 1. Assinatura.
    const assinaturaOk = validarAssinaturaCalendly(
      request.headers.get("calendly-webhook-signature"),
      rawBody,
      requireEnv("CALENDLY_WEBHOOK_SIGNING_KEY"),
    );
    if (!assinaturaOk) {
      logarErro(new Error("Assinatura Calendly inválida"), { rota });
      return NextResponse.json({ erro: "Assinatura inválida." }, { status: 401 });
    }

    // 2. Zod.
    const validado = validarJson(rawBody, calendlyEventoSchema, { rota });
    if (!validado.ok) return validado.resposta;
    const evento = validado.data;

    // 3. Idempotência: evento + uri do invitee.
    const chaveEvento = `${evento.event}:${evento.payload.uri}`;
    if (await jaProcessado(ORIGEM, chaveEvento)) {
      return NextResponse.json({ status: "ignorado", motivo: "evento_duplicado" });
    }

    const db = getServiceClient();

    // 4. Payload cru.
    const { error: eBruto } = await db.from("eventos_brutos").insert({
      origem: ORIGEM,
      payload: evento as unknown as Json,
    });
    if (eBruto) throw new Error(`Falha ao salvar evento bruto: ${eBruto.message}`);

    // 5. Só tratamos os dois eventos de invitee.
    if (evento.event === "invitee.created" || evento.event === "invitee.canceled") {
      const alunaId = await acharOuCriarAluna(db, evento.payload);
      await gravarReuniao(db, alunaId, evento);
    }

    await marcarProcessado(ORIGEM, chaveEvento);

    return NextResponse.json({ status: "processado", evento: evento.event });
  });
}

/** Casa a aluna pelo email do invitee; cria se não achar. */
async function acharOuCriarAluna(
  db: SupabaseServer,
  payload: CalendlyEvento["payload"],
): Promise<string> {
  const email = payload.email ?? null;
  const nome = payload.name ?? email ?? "Convidado Calendly";

  if (email) {
    const { data, error } = await db
      .from("alunas")
      .select("id")
      .eq("email", email)
      .limit(1);
    if (error) throw new Error(`Falha ao buscar aluna por email: ${error.message}`);
    const achado = data?.[0];
    if (achado) return achado.id;
  }

  const nova: TablesInsert<"alunas"> = {
    nome,
    email,
    telefone: null,
    metadata: { origem_cadastro: "calendly" },
  };
  const { data, error } = await db.from("alunas").insert(nova).select("id").single();
  if (error || !data) {
    throw new Error(`Falha ao criar aluna: ${error?.message ?? "sem retorno"}`);
  }
  return data.id;
}

/**
 * Insere (created) ou atualiza (canceled) a reunião, deduplicando por
 * (origem, referencia_externa = uri do invitee).
 */
async function gravarReuniao(
  db: SupabaseServer,
  alunaId: string,
  evento: CalendlyEvento,
): Promise<void> {
  const agendado = evento.payload.scheduled_event;
  const cancelado = evento.event === "invitee.canceled";
  const registro = {
    aluna_id: alunaId,
    origem: ORIGEM,
    status: cancelado ? "cancelada" : "agendada",
    data_hora: agendado.start_time ?? null,
    link: agendado.location?.join_url ?? agendado.uri,
    referencia_externa: evento.payload.uri,
  } satisfies TablesInsert<"reunioes">;

  const { data, error } = await db
    .from("reunioes")
    .select("id")
    .eq("origem", ORIGEM)
    .eq("referencia_externa", evento.payload.uri)
    .limit(1);
  if (error) throw new Error(`Falha ao buscar reunião existente: ${error.message}`);

  const existente = data?.[0];
  if (existente) {
    const { error: eUp } = await db
      .from("reunioes")
      .update(registro)
      .eq("id", existente.id);
    if (eUp) throw new Error(`Falha ao atualizar reunião: ${eUp.message}`);
  } else {
    const { error: eIns } = await db.from("reunioes").insert(registro);
    if (eIns) throw new Error(`Falha ao inserir reunião: ${eIns.message}`);
  }
}
