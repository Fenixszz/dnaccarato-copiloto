/**
 * Tratamento específico de erro de BILLING da API da Anthropic.
 *
 * Saldo insuficiente / cartão recusado é um problema da CONTA DO JOÃO (FOVA) —
 * não da Adriana. Então, ao detectar, a gente:
 *   1. loga em falhas_sistema com severidade ALTA;
 *   2. avisa o WhatsApp do JOÃO (não o da Adriana — é infra dele resolver),
 *      com throttle pra não spammar durante a indisponibilidade.
 *
 * A Adriana continua recebendo só o fallback genérico do copiloto (ela não
 * precisa saber que é billing).
 */
import { optionalEnv } from "@/lib/env";
import { registrarFalhaSistema, lerEstado, salvarEstado } from "@/lib/db/queries";
import { enviarComRetry } from "@/lib/whatsapp/envio";
import { normalizarTelefone } from "@/lib/matching/matcher";

/** Erro de billing da Anthropic — distinto de uma falha genérica da API. */
export class ErroBillingAnthropic extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroBillingAnthropic";
  }
}

// Só consideramos billing em respostas que a Anthropic usa pra isso
// (400 saldo baixo, 402 pagamento, 403 billing_error). Evita falso-positivo em
// 500 que por acaso mencione "billing".
const STATUS_BILLING = new Set([400, 402, 403]);

const PADRAO_BILLING =
  /credit balance|insufficient (funds|credit|balance)|billing|payment method|card (was )?declin|too low to access|purchase more credits|plans_and_billing/i;

/**
 * Diz se a resposta de erro da Anthropic é de billing. PURA (testável): recebe
 * o status HTTP e o corpo cru. `error.type === "billing_error"` sempre conta;
 * senão, casa a mensagem por padrão em um status compatível.
 */
export function ehErroBillingAnthropic(status: number, corpoTexto: string): boolean {
  let tipo: string | undefined;
  let mensagem = "";
  try {
    const parsed = JSON.parse(corpoTexto) as {
      type?: string;
      message?: string;
      error?: { type?: string; message?: string };
    };
    const err = parsed.error ?? parsed;
    tipo = err?.type;
    mensagem = typeof err?.message === "string" ? err.message : "";
  } catch {
    mensagem = corpoTexto; // corpo não-JSON: usa o texto cru
  }

  if (tipo === "billing_error") return true;
  return STATUS_BILLING.has(status) && PADRAO_BILLING.test(mensagem);
}

// Throttle do alerta por WhatsApp (o log em falhas_sistema é sempre gravado).
const CHAVE_THROTTLE = "alerta_billing_anthropic_em";
const JANELA_MS = 3 * 60 * 60 * 1000; // 3h

async function deveAvisarWhatsapp(agora: number): Promise<boolean> {
  try {
    const valor = await lerEstado(CHAVE_THROTTLE);
    const ultimo =
      valor !== null && typeof valor === "object" && !Array.isArray(valor)
        ? (valor as { em?: unknown }).em
        : null;
    if (typeof ultimo !== "string") return true;
    const ms = Date.parse(ultimo);
    return Number.isNaN(ms) || agora - ms > JANELA_MS;
  } catch {
    return true; // se o throttle falhar, é melhor avisar do que silenciar
  }
}

/**
 * Reage a um erro de billing da Anthropic: log ALTA (sempre) + WhatsApp pro
 * João (com throttle). Best-effort — nunca lança (não pode piorar a falha que
 * já está acontecendo).
 */
export async function alertarBillingAnthropic(detalhe: string): Promise<void> {
  await registrarFalhaSistema({
    tipo: "anthropic_billing",
    severidade: "alta",
    mensagem: `Billing da Anthropic recusado (conta do João/FOVA): ${detalhe}`,
    contexto: { detalhe },
  });

  try {
    const numero = optionalEnv("WHATSAPP_JOAO");
    if (!numero) return; // sem número do João, fica só o log

    const agora = Date.now();
    if (!(await deveAvisarWhatsapp(agora))) return;

    const texto =
      "⚠️ Copiloto Naccarato: a API da Anthropic recusou por *billing* " +
      "(saldo/cartão da conta FOVA). O copiloto está respondendo em fallback. " +
      "Resolva o pagamento na Anthropic pra normalizar — a Adriana não foi avisada.";
    const envio = await enviarComRetry(
      { numero: normalizarTelefone(numero), texto },
      { contexto: { origem: "alerta_billing_anthropic" } },
    );
    if (envio.ok) {
      await salvarEstado(CHAVE_THROTTLE, { em: new Date(agora).toISOString() });
    }
  } catch {
    // Alerta é best-effort; a falha alta já ficou registrada acima.
  }
}
