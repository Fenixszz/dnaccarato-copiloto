import { NextResponse } from "next/server";
import { comTratamentoDeErro, logarErro, validarCorpo } from "@/lib/webhooks/validation";
import { jaProcessado, marcarProcessado } from "@/lib/webhooks/idempotency";
import {
  asaasPagamentoWebhookSchema,
  type AsaasPagamentoWebhook,
} from "@/lib/validation/schemas";
import { requireEnv } from "@/lib/env";
import { getServiceClient } from "@/lib/db/client";
import { buscarCliente, mapearStatusAsaas } from "@/lib/integrations/asaas";
import type { Json, TablesInsert } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const ORIGEM = "asaas";
type SupabaseServer = ReturnType<typeof getServiceClient>;

/**
 * Webhook do Asaas (eventos de pagamento) — conta Asaas da Adriana.
 *
 * Fluxo (CLAUDE.md):
 *  1. Valida o header `asaas-access-token` == ASAAS_WEBHOOK_TOKEN (token
 *     estático, não é assinatura criptográfica) → 401 se não bater.
 *  2. Valida o payload com Zod → 400 se inválido.
 *  3. Idempotência pelo `id` do evento (checa ANTES de qualquer escrita).
 *  4. Salva o payload cru em `eventos_brutos`.
 *  5. Casa com uma aluna (email ou telefone do cliente Asaas); cria se não achar.
 *  6. Grava/atualiza em `pagamentos`.
 *  7. Marca como processado.
 *  8. Responde 200 rápido.
 *
 * IMPORTANTE (operacional): se o Asaas receber falha (>= 500) 15 vezes seguidas,
 * ele PAUSA a fila de sincronização e é preciso reativar manualmente em
 * Minha Conta → Integração. Por isso o processamento é enxuto e idempotente:
 * uma reentrega do mesmo evento é segura (passos 3 e 7).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rota = "POST /api/webhooks/asaas";

  return comTratamentoDeErro({ rota }, async () => {
    // 1. Token estático no header.
    const tokenEsperado = requireEnv("ASAAS_WEBHOOK_TOKEN");
    if (request.headers.get("asaas-access-token") !== tokenEsperado) {
      logarErro(new Error("asaas-access-token ausente ou inválido"), { rota });
      return NextResponse.json({ erro: "Token inválido." }, { status: 401 });
    }

    // 2. Validação do payload.
    const validado = await validarCorpo(request, asaasPagamentoWebhookSchema, { rota });
    if (!validado.ok) return validado.resposta;
    const evento = validado.data;

    // 3. Idempotência pelo id do evento — antes de qualquer escrita.
    if (await jaProcessado(ORIGEM, evento.id)) {
      return NextResponse.json({ status: "ignorado", motivo: "evento_duplicado" });
    }

    const db = getServiceClient();

    // 4. Payload cru em eventos_brutos.
    const { error: eBruto } = await db.from("eventos_brutos").insert({
      origem: ORIGEM,
      payload: evento as unknown as Json,
    });
    if (eBruto) throw new Error(`Falha ao salvar evento bruto: ${eBruto.message}`);

    // 5. Casa/cria a aluna.
    const alunaId = await acharOuCriarAluna(db, evento.payment.customer);

    // 6. Grava/atualiza o pagamento.
    await gravarPagamento(db, alunaId, evento.payment);

    // 7. Marca como processado (só após sucesso).
    await marcarProcessado(ORIGEM, evento.id);

    // 8. 200 rápido.
    return NextResponse.json({ status: "processado" });
  });
}

/**
 * Busca o cliente no Asaas e casa com uma aluna por email OU telefone.
 * Se não achar, cria uma aluna nova. Retorna o id da aluna.
 */
async function acharOuCriarAluna(
  db: SupabaseServer,
  customerId: string,
): Promise<string> {
  const cliente = await buscarCliente(customerId);
  const email = cliente.email ?? null;
  const telefone = cliente.mobilePhone ?? cliente.phone ?? null;

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

  if (telefone) {
    const { data, error } = await db
      .from("alunas")
      .select("id")
      .eq("telefone", telefone)
      .limit(1);
    if (error) throw new Error(`Falha ao buscar aluna por telefone: ${error.message}`);
    const achado = data?.[0];
    if (achado) return achado.id;
  }

  const nova: TablesInsert<"alunas"> = {
    nome: cliente.name ?? "Aluna sem nome (Asaas)",
    email,
    telefone,
    metadata: { origem_cadastro: "asaas", asaas_customer_id: customerId },
  };
  const { data, error } = await db.from("alunas").insert(nova).select("id").single();
  if (error || !data) {
    throw new Error(`Falha ao criar aluna: ${error?.message ?? "sem retorno"}`);
  }
  return data.id;
}

/** Insere ou atualiza o pagamento, deduplicando por (origem, referencia_externa). */
async function gravarPagamento(
  db: SupabaseServer,
  alunaId: string,
  payment: AsaasPagamentoWebhook["payment"],
): Promise<void> {
  const registro = {
    aluna_id: alunaId,
    origem: ORIGEM,
    status: mapearStatusAsaas(payment.status),
    valor: payment.value,
    vencimento: payment.dueDate ?? null,
    pago_em: payment.paymentDate ?? null,
    referencia_externa: payment.id,
  } satisfies TablesInsert<"pagamentos">;

  const { data, error } = await db
    .from("pagamentos")
    .select("id")
    .eq("origem", ORIGEM)
    .eq("referencia_externa", payment.id)
    .limit(1);
  if (error) throw new Error(`Falha ao buscar pagamento existente: ${error.message}`);

  const existente = data?.[0];
  if (existente) {
    const { error: eUp } = await db
      .from("pagamentos")
      .update(registro)
      .eq("id", existente.id);
    if (eUp) throw new Error(`Falha ao atualizar pagamento: ${eUp.message}`);
  } else {
    const { error: eIns } = await db.from("pagamentos").insert(registro);
    if (eIns) throw new Error(`Falha ao inserir pagamento: ${eIns.message}`);
  }
}
