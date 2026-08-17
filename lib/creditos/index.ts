/**
 * Acesso ao banco para o fluxo de crédito (saldo global da Adriana).
 *
 * - RECARGA: manual, só o João registra (checagem de e-mail fica na rota).
 * - DÉBITO (uso): automático, best-effort — NUNCA derruba a operação que está
 *   sendo medida. O saldo é só um medidor de transparência; nunca bloqueia nada.
 */
import { getServiceClient } from "@/lib/db/client";
import { registrarFalhaSistema } from "@/lib/db/queries";
import { inicioDeHojeSP } from "@/lib/tempo";

export interface Saldo {
  saldoCentavos: number;
  atualizadoEm: string;
}

/** Lê o saldo global (linha única). Cria a linha zerada se ainda não existir. */
export async function lerSaldo(): Promise<Saldo> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("creditos_saldo")
    .select("saldo_centavos, atualizado_em")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler saldo de créditos: ${error.message}`);
  if (data) {
    return { saldoCentavos: data.saldo_centavos, atualizadoEm: data.atualizado_em };
  }
  // Sem linha ainda (migration não semeou / ambiente novo): cria zerada.
  const { data: nova, error: eIns } = await db
    .from("creditos_saldo")
    .insert({ id: true, saldo_centavos: 0 })
    .select("saldo_centavos, atualizado_em")
    .single();
  if (eIns) throw new Error(`Falha ao inicializar saldo de créditos: ${eIns.message}`);
  return { saldoCentavos: nova.saldo_centavos, atualizadoEm: nova.atualizado_em };
}

/** Soma um delta (em centavos) ao saldo e devolve o novo saldo. */
async function ajustarSaldo(deltaCentavos: number): Promise<number> {
  const db = getServiceClient();
  const atual = await lerSaldo();
  const novo = atual.saldoCentavos + deltaCentavos;
  const { error } = await db
    .from("creditos_saldo")
    .update({ saldo_centavos: novo })
    .eq("id", true);
  if (error) throw new Error(`Falha ao ajustar saldo de créditos: ${error.message}`);
  return novo;
}

export interface RecargaRegistrada {
  valorCentavos: number;
  saldoCentavos: number;
}

/**
 * Registra uma recarga (Pix confirmado pelo João): grava em creditos_recargas
 * e SOMA no saldo. `registradaPor` é o e-mail de quem registrou (auditoria).
 * Lança em erro — a rota trata e responde HTTP apropriado.
 */
export async function registrarRecarga(params: {
  valorCentavos: number;
  registradaPor: string;
  observacao?: string | null;
}): Promise<RecargaRegistrada> {
  const db = getServiceClient();
  const { error } = await db.from("creditos_recargas").insert({
    valor_centavos: params.valorCentavos,
    registrada_por: params.registradaPor,
    observacao: params.observacao ?? null,
  });
  if (error) throw new Error(`Falha ao registrar recarga: ${error.message}`);

  const saldoCentavos = await ajustarSaldo(params.valorCentavos);
  return { valorCentavos: params.valorCentavos, saldoCentavos };
}

/**
 * Registra um uso (débito automático) e subtrai do saldo. BEST-EFFORT: qualquer
 * falha é logada em falhas_sistema e engolida — não pode quebrar a chamada à
 * Anthropic nem o envio de WhatsApp que a originou. O saldo nunca bloqueia nada.
 */
export async function registrarUso(params: {
  servico: "anthropic" | "whatsapp";
  valorEstimadoCentavos: number;
  referencia?: string | null;
}): Promise<void> {
  try {
    if (params.valorEstimadoCentavos <= 0) return;
    const db = getServiceClient();
    const { error } = await db.from("creditos_uso").insert({
      servico: params.servico,
      valor_estimado_centavos: params.valorEstimadoCentavos,
      referencia: params.referencia ?? null,
    });
    if (error) throw new Error(error.message);
    await ajustarSaldo(-params.valorEstimadoCentavos);
  } catch (erro) {
    await registrarFalhaSistema({
      tipo: "credito_uso",
      severidade: "baixa",
      mensagem: `Falha ao registrar uso de crédito (${params.servico}): ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
      contexto: { servico: params.servico, centavos: params.valorEstimadoCentavos },
    });
  }
}

/** Valor (centavos) da recarga mais recente, ou null se nunca houve recarga. */
export async function ultimaRecargaCentavos(): Promise<number | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("creditos_recargas")
    .select("valor_centavos")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler última recarga: ${error.message}`);
  return data?.valor_centavos ?? null;
}

/**
 * Média de consumo diário (centavos/dia) nos últimos `dias` dias, para estimar
 * "dias restantes". Soma o uso na janela e divide pelo número de dias.
 */
export async function mediaConsumoDiarioCentavos(
  dias = 7,
  agora: Date = new Date(),
): Promise<number> {
  const db = getServiceClient();
  const inicioHoje = new Date(inicioDeHojeSP(agora)).getTime();
  const desde = new Date(inicioHoje - (dias - 1) * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("creditos_uso")
    .select("valor_estimado_centavos")
    .gte("criado_em", desde);
  if (error) throw new Error(`Falha ao ler consumo recente: ${error.message}`);

  const total = (data ?? []).reduce(
    (soma, u) => soma + (u.valor_estimado_centavos ?? 0),
    0,
  );
  return total / dias;
}

/** Total gasto (centavos) e nº de eventos por serviço, desde sempre. */
export interface ExtratoCategoria {
  servico: "anthropic" | "whatsapp";
  totalCentavos: number;
  eventos: number;
}

/**
 * Extrato de uso agregado por categoria (IA / WhatsApp), desde o começo. Soma
 * em memória — a base de uso de um escritório é pequena.
 */
export async function extratoUsoPorCategoria(): Promise<ExtratoCategoria[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("creditos_uso")
    .select("servico, valor_estimado_centavos");
  if (error) throw new Error(`Falha ao ler extrato de uso: ${error.message}`);

  const acc: Record<
    "anthropic" | "whatsapp",
    { totalCentavos: number; eventos: number }
  > = {
    anthropic: { totalCentavos: 0, eventos: 0 },
    whatsapp: { totalCentavos: 0, eventos: 0 },
  };
  for (const u of data ?? []) {
    const chave = u.servico === "whatsapp" ? "whatsapp" : "anthropic";
    acc[chave].totalCentavos += u.valor_estimado_centavos ?? 0;
    acc[chave].eventos += 1;
  }
  return [
    { servico: "anthropic", ...acc.anthropic },
    { servico: "whatsapp", ...acc.whatsapp },
  ];
}

/** Soma (centavos) do uso de um serviço nos últimos `dias` dias. */
export async function totalUsoServicoUltimosDias(
  servico: "anthropic" | "whatsapp",
  dias = 30,
  agora: Date = new Date(),
): Promise<number> {
  const db = getServiceClient();
  const desde = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("creditos_uso")
    .select("valor_estimado_centavos")
    .eq("servico", servico)
    .gte("criado_em", desde);
  if (error) throw new Error(`Falha ao somar uso de ${servico}: ${error.message}`);
  return (data ?? []).reduce((s, u) => s + (u.valor_estimado_centavos ?? 0), 0);
}

/** Recarga exibida no histórico. */
export interface RecargaHistorico {
  id: string;
  valorCentavos: number;
  registradaPor: string;
  observacao: string | null;
  criadoEm: string;
}

/** Últimas recargas (mais recentes primeiro). */
export async function historicoRecargas(limite = 20): Promise<RecargaHistorico[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("creditos_recargas")
    .select("id, valor_centavos, registrada_por, observacao, criado_em")
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Falha ao ler histórico de recargas: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    valorCentavos: r.valor_centavos,
    registradaPor: r.registrada_por,
    observacao: r.observacao,
    criadoEm: r.criado_em,
  }));
}
