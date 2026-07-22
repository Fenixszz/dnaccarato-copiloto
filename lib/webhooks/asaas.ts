import { obterSupabase } from "@/lib/db/supabase";
import type { Json } from "@/lib/db/types";
import { buscarClienteAsaas } from "@/lib/integrations/asaas";
import { encontrarPorContato } from "@/lib/matching/contatos";
import { normalizarNome } from "@/lib/matching/nomes";
import type { ClienteAsaas, EventoAsaas, PagamentoAsaas } from "@/lib/validation/asaas";
import { jaProcessado, marcarProcessado } from "@/lib/webhooks/idempotency";

const ORIGEM = "asaas";

// Recarga de créditos (Fase 7) é identificada pela referência externa ou
// descrição da cobrança conter "recarga". Por enquanto a regra é: recarga
// cujo cliente não bate com nenhuma aluna é ignorada (não cria aluna).
export function ehRecargaDeCreditos(pagamento: PagamentoAsaas): boolean {
  const referencia = normalizarNome(pagamento.externalReference ?? "");
  const descricao = normalizarNome(pagamento.description ?? "");
  return referencia.startsWith("recarga") || descricao.includes("recarga");
}

async function salvarEventoBruto(payloadCru: unknown): Promise<void> {
  const { error } = await obterSupabase()
    .from("eventos_brutos")
    .insert({
      origem: ORIGEM,
      // A rota só chega aqui com corpo que veio de JSON.parse, então o valor
      // é JSON válido por construção.
      payload: payloadCru as Json,
    });
  if (error) {
    throw new Error(`Falha ao salvar evento bruto: ${error.message}`);
  }
}

async function encontrarAluna(cliente: ClienteAsaas): Promise<string | null> {
  const { data: alunas, error } = await obterSupabase()
    .from("alunas")
    .select("id, nome, email, telefone");
  if (error) {
    throw new Error(`Falha ao listar alunas para matching: ${error.message}`);
  }
  const encontrada = encontrarPorContato(alunas ?? [], cliente.email, [
    cliente.mobilePhone,
    cliente.phone,
  ]);
  return encontrada ? encontrada.id : null;
}

async function criarAluna(cliente: ClienteAsaas, clienteId: string): Promise<string> {
  const { data, error } = await obterSupabase()
    .from("alunas")
    .insert({
      nome: cliente.name,
      email: cliente.email ?? null,
      telefone: cliente.mobilePhone ?? cliente.phone ?? null,
      metadata: { origem_cadastro: "webhook_asaas", asaas_customer_id: clienteId },
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`Falha ao criar aluna: ${error.message}`);
  }
  return data.id;
}

async function gravarPagamento(pagamento: PagamentoAsaas, alunaId: string): Promise<void> {
  const { error } = await obterSupabase()
    .from("pagamentos")
    .upsert(
      {
        aluna_id: alunaId,
        origem: ORIGEM,
        status: pagamento.status,
        valor: pagamento.value,
        vencimento: pagamento.dueDate ?? null,
        pago_em: pagamento.clientPaymentDate ?? pagamento.paymentDate ?? null,
        referencia_externa: pagamento.id,
      },
      { onConflict: "origem,referencia_externa" }
    );
  if (error) {
    throw new Error(`Falha ao gravar pagamento ${pagamento.id}: ${error.message}`);
  }
}

export type ResultadoProcessamento = {
  status: "duplicado" | "ignorado" | "processado";
  resumo: string;
};

// Fluxo completo de um evento do Asaas. A rota já validou assinatura e
// payload; erro em qualquer etapa estoura pra rota responder 500 SEM marcar
// como processado — o Asaas reentrega e o fluxo recomeça do zero.
export async function processarEventoAsaas(
  evento: EventoAsaas,
  payloadCru: unknown
): Promise<ResultadoProcessamento> {
  if (await jaProcessado(ORIGEM, evento.id)) {
    return { status: "duplicado", resumo: "evento já processado, entrega repetida ignorada" };
  }

  await salvarEventoBruto(payloadCru);

  if (!evento.event.startsWith("PAYMENT_") || !evento.payment) {
    const resumo = `evento ${evento.event} ignorado (não é de pagamento)`;
    await marcarProcessado(ORIGEM, evento.id, resumo);
    return { status: "ignorado", resumo };
  }

  const pagamento = evento.payment;
  const cliente = await buscarClienteAsaas(pagamento.customer);
  const alunaExistente = await encontrarAluna(cliente);

  if (ehRecargaDeCreditos(pagamento) && alunaExistente === null) {
    const resumo = `recarga de créditos ${pagamento.id} ignorada (tratada na Fase 7)`;
    await marcarProcessado(ORIGEM, evento.id, resumo);
    return { status: "ignorado", resumo };
  }

  const alunaId = alunaExistente ?? (await criarAluna(cliente, pagamento.customer));
  await gravarPagamento(pagamento, alunaId);

  const resumo = `pagamento ${pagamento.id} (${pagamento.status}) gravado para aluna ${alunaId}`;
  await marcarProcessado(ORIGEM, evento.id, resumo);
  return { status: "processado", resumo };
}
