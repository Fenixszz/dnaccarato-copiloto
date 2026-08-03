import { NextResponse } from "next/server";
import { comTratamentoDeErro, logarErro, validarCorpo } from "@/lib/webhooks/validation";
import { jaProcessado, marcarProcessado } from "@/lib/webhooks/idempotency";
import {
  formsRespostaWebhookSchema,
  type FormsRespostaWebhook,
} from "@/lib/validation/schemas";
import { requireEnv } from "@/lib/env";
import { getServiceClient } from "@/lib/db/client";
import type { Json, TablesInsert } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const ORIGEM = "forms";
type SupabaseServer = ReturnType<typeof getServiceClient>;

/**
 * Webhook do Google Forms (via Apps Script) — Form da Adriana.
 *
 * O Apps Script não assina a requisição nativamente, então autenticamos por um
 * segredo compartilhado no header `X-Forms-Secret` (== FORMS_WEBHOOK_SECRET).
 *
 * Fluxo (CLAUDE.md):
 *  1. Confere o header X-Forms-Secret → 401 se não bater.
 *  2. Valida o payload com Zod → 400.
 *  3. Idempotência pelo responseId (id da resposta no Forms).
 *  4. Salva o payload cru em eventos_brutos.
 *  5. Casa/cria a aluna (email da resposta) e grava em `formularios`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rota = "POST /api/webhooks/forms";

  return comTratamentoDeErro({ rota }, async () => {
    // 1. Segredo compartilhado no header.
    if (request.headers.get("x-forms-secret") !== requireEnv("FORMS_WEBHOOK_SECRET")) {
      logarErro(new Error("X-Forms-Secret ausente ou inválido"), { rota });
      return NextResponse.json({ erro: "Segredo inválido." }, { status: 401 });
    }

    // 2. Validação do payload.
    const validado = await validarCorpo(request, formsRespostaWebhookSchema, { rota });
    if (!validado.ok) return validado.resposta;
    const evento = validado.data;

    // 3. Idempotência pelo id da resposta.
    if (await jaProcessado(ORIGEM, evento.responseId)) {
      return NextResponse.json({ status: "ignorado", motivo: "evento_duplicado" });
    }

    const db = getServiceClient();

    // 4. Payload cru.
    const { error: eBruto } = await db.from("eventos_brutos").insert({
      origem: ORIGEM,
      payload: evento as unknown as Json,
    });
    if (eBruto) throw new Error(`Falha ao salvar evento bruto: ${eBruto.message}`);

    // 5. Casa/cria a aluna e grava a resposta do formulário.
    const alunaId = await acharOuCriarAluna(db, evento);
    const { error: eForm } = await db.from("formularios").insert({
      aluna_id: alunaId,
      formulario_nome: evento.formTitle ?? evento.formId,
      respostas: (evento.respostas ?? {}) as Json,
      respondido_em: evento.respondidoEm ?? null,
    });
    if (eForm) throw new Error(`Falha ao gravar formulário: ${eForm.message}`);

    await marcarProcessado(ORIGEM, evento.responseId);

    return NextResponse.json({ status: "processado" });
  });
}

/** Casa a aluna pelo email da resposta; cria se não achar. */
async function acharOuCriarAluna(
  db: SupabaseServer,
  evento: FormsRespostaWebhook,
): Promise<string> {
  const email = evento.email ?? null;
  const nome = evento.nome ?? email ?? "Respondente do formulário";

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
    metadata: { origem_cadastro: "forms" },
  };
  const { data, error } = await db.from("alunas").insert(nova).select("id").single();
  if (error || !data) {
    throw new Error(`Falha ao criar aluna: ${error?.message ?? "sem retorno"}`);
  }
  return data.id;
}
