import { optionalEnv, requireEnv } from "@/lib/env";
import { whatsappRateLimiter } from "@/lib/whatsapp/rateLimiter";
import { registrarUso } from "@/lib/creditos";
import { custoWhatsappCentavos, tarifasDoEnv } from "@/lib/creditos/custos";

/**
 * Client da Evolution API (WhatsApp) — conta Evolution API do João.
 *
 * Todo envio passa pelo rate limiter compartilhado (CLAUDE.md): nunca dispara
 * em rajada. As credenciais vêm de variável de ambiente.
 */

export interface EnvioTexto {
  /** Número de destino no formato internacional (ex: "5511999999999"). */
  numero: string;
  /** Texto da mensagem. */
  texto: string;
}

export interface ResultadoEnvio {
  ok: boolean;
  status: number;
  corpo: unknown;
}

/**
 * Envia uma mensagem de texto via Evolution API, respeitando o rate limiter.
 */
export async function enviarTexto(envio: EnvioTexto): Promise<ResultadoEnvio> {
  return whatsappRateLimiter.agendar(async () => {
    const baseUrl = requireEnv("EVOLUTION_API_URL").replace(/\/$/, "");
    const apiKey = requireEnv("EVOLUTION_API_KEY");
    const instance = requireEnv("EVOLUTION_INSTANCE");

    const resposta = await fetch(`${baseUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: envio.numero,
        text: envio.texto,
      }),
    });

    let corpo: unknown = null;
    try {
      corpo = await resposta.json();
    } catch {
      corpo = null;
    }

    // Débito de crédito por mensagem enviada (só quando deu certo). Best-effort:
    // nunca derruba o envio nem o retorno.
    if (resposta.ok) {
      await registrarUso({
        servico: "whatsapp",
        valorEstimadoCentavos: custoWhatsappCentavos(tarifasDoEnv()),
        // Sem referência (evita guardar o telefone da aluna em creditos_uso).
        referencia: null,
      });
    }

    return { ok: resposta.ok, status: resposta.status, corpo };
  });
}

/** URL base configurada (ou string vazia se ausente) — útil para diagnóstico. */
export function baseUrlConfigurada(): string {
  return optionalEnv("EVOLUTION_API_URL");
}
