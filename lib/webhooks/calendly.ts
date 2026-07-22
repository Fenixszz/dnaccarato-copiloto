import { createHmac, timingSafeEqual } from "node:crypto";
import { obterSupabase } from "@/lib/db/supabase";
import type { Json } from "@/lib/db/types";
import { encontrarPorContato } from "@/lib/matching/contatos";
import {
  EVENTOS_CALENDLY_TRATADOS,
  type ConvidadaCalendly,
  type EventoCalendly,
} from "@/lib/validation/calendly";
import { jaProcessado, marcarProcessado } from "@/lib/webhooks/idempotency";

const ORIGEM = "calendly";

// Janela anti-replay da assinatura, conforme recomendação do Calendly.
const TOLERANCIA_ASSINATURA_MS = 5 * 60 * 1000;

// Assinatura conforme a documentação do Calendly: header
// Calendly-Webhook-Signature no formato "t=<timestamp ms>,v1=<hex>", onde v1
// é HMAC-SHA256 de "<t>.<corpo cru>" com a signing key da subscription.
export function assinaturaCalendlyValida(
  cabecalho: string | null,
  corpoCru: string,
  chaveDeAssinatura: string
): boolean {
  if (!cabecalho) {
    return false;
  }
  const partes = new Map(
    cabecalho.split(",").map((parte) => {
      const [nome, ...resto] = parte.trim().split("=");
      return [nome, resto.join("=")] as const;
    })
  );
  const timestamp = partes.get("t");
  const assinaturaRecebida = partes.get("v1");
  if (!timestamp || !assinaturaRecebida) {
    return false;
  }
  const idadeMs = Math.abs(Date.now() - Number(timestamp));
  if (!Number.isFinite(idadeMs) || idadeMs > TOLERANCIA_ASSINATURA_MS) {
    return false;
  }
  const assinaturaEsperada = createHmac("sha256", chaveDeAssinatura)
    .update(`${timestamp}.${corpoCru}`)
    .digest("hex");
  const bufferRecebido = Buffer.from(assinaturaRecebida);
  const bufferEsperado = Buffer.from(assinaturaEsperada);
  if (bufferRecebido.length !== bufferEsperado.length) {
    return false;
  }
  return timingSafeEqual(bufferRecebido, bufferEsperado);
}

async function salvarEventoBruto(payloadCru: unknown): Promise<void> {
  const { error } = await obterSupabase()
    .from("eventos_brutos")
    .insert({
      origem: ORIGEM,
      // A rota só chega aqui com corpo que veio de JSON.parse.
      payload: payloadCru as Json,
    });
  if (error) {
    throw new Error(`Falha ao salvar evento bruto: ${error.message}`);
  }
}

async function encontrarOuCriarAluna(convidada: ConvidadaCalendly): Promise<string> {
  const { data: alunas, error } = await obterSupabase()
    .from("alunas")
    .select("id, nome, email, telefone");
  if (error) {
    throw new Error(`Falha ao listar alunas para matching: ${error.message}`);
  }
  const encontrada = encontrarPorContato(alunas ?? [], convidada.email, [
    convidada.text_reminder_number,
  ]);
  if (encontrada) {
    return encontrada.id;
  }
  const { data, error: erroCriacao } = await obterSupabase()
    .from("alunas")
    .insert({
      nome: convidada.name,
      email: convidada.email ?? null,
      telefone: convidada.text_reminder_number ?? null,
      metadata: { origem_cadastro: "webhook_calendly" },
    })
    .select("id")
    .single();
  if (erroCriacao) {
    throw new Error(`Falha ao criar aluna: ${erroCriacao.message}`);
  }
  return data.id;
}

async function gravarReuniao(
  convidada: ConvidadaCalendly,
  alunaId: string,
  status: "agendada" | "cancelada"
): Promise<void> {
  const agendamento = convidada.scheduled_event;
  const { error } = await obterSupabase()
    .from("reunioes")
    .upsert(
      {
        aluna_id: alunaId,
        origem: ORIGEM,
        data_hora: agendamento.start_time,
        status,
        link: agendamento.location?.join_url ?? null,
        referencia_externa: agendamento.uri,
      },
      { onConflict: "origem,referencia_externa" }
    );
  if (error) {
    throw new Error(`Falha ao gravar reunião ${agendamento.uri}: ${error.message}`);
  }
}

export type ResultadoProcessamento = {
  status: "duplicado" | "ignorado" | "processado";
  resumo: string;
};

// Fluxo completo de um evento do Calendly. A rota já validou assinatura e
// payload; erro em qualquer etapa estoura pra rota responder 500 SEM marcar
// como processado — o Calendly reenvia depois.
export async function processarEventoCalendly(
  evento: EventoCalendly,
  payloadCru: unknown
): Promise<ResultadoProcessamento> {
  const tratado = (EVENTOS_CALENDLY_TRATADOS as readonly string[]).includes(evento.event);
  if (!tratado || !evento.payload) {
    await salvarEventoBruto(payloadCru);
    return { status: "ignorado", resumo: `evento ${evento.event} ignorado (não tratado)` };
  }

  const convidada = evento.payload;
  // O Calendly não manda id de evento no corpo; tipo + URI do invitee é único
  // por acontecimento (created e canceled do mesmo invitee são eventos
  // distintos).
  const eventoId = `${evento.event}:${convidada.uri}`;

  if (await jaProcessado(ORIGEM, eventoId)) {
    return { status: "duplicado", resumo: "evento já processado, entrega repetida ignorada" };
  }

  await salvarEventoBruto(payloadCru);

  const alunaId = await encontrarOuCriarAluna(convidada);
  const status = evento.event === "invitee.canceled" ? "cancelada" : "agendada";
  await gravarReuniao(convidada, alunaId, status);

  await marcarProcessado(ORIGEM, eventoId, `reunião ${status} para aluna ${alunaId}`);
  return {
    status: "processado",
    resumo: `reunião ${convidada.scheduled_event.uri} ${status} para aluna ${alunaId}`,
  };
}
