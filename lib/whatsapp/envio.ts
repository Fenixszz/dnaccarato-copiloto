import { enviarTexto } from "@/lib/whatsapp/client";
import { registrarFalhaSistema } from "@/lib/db/queries";
import type { Json } from "@/lib/db/types";

/**
 * Envio de WhatsApp com retry + backoff. QUALQUER envio importante (briefing,
 * resposta) deve passar por aqui. Se todas as tentativas falharem, registra em
 * `falhas_sistema` com severidade alta.
 *
 * (O espaçamento entre envios distintos continua a cargo do rate limiter, dentro
 * de enviarTexto; o backoff aqui é só entre re-tentativas do MESMO envio.)
 */

const TENTATIVAS_PADRAO = 3;

export interface ResultadoEnvioRetry {
  ok: boolean;
  tentativas: number;
  ultimoStatus?: number;
}

interface OpcoesEnvio {
  tentativas?: number;
  /** Contexto extra (sem dado sensível) para a falha, se todas as tentativas falharem. */
  contexto?: Record<string, Json>;
  /** Espera injetável (para testes). */
  dormir?: (ms: number) => Promise<void>;
}

/** Backoff exponencial: 500ms, 1000ms, 2000ms, ... */
function backoffMs(tentativa: number): number {
  return 500 * 2 ** (tentativa - 1);
}

export async function enviarComRetry(
  envio: { numero: string; texto: string },
  opcoes: OpcoesEnvio = {},
): Promise<ResultadoEnvioRetry> {
  const maxTentativas = opcoes.tentativas ?? TENTATIVAS_PADRAO;
  const dormir =
    opcoes.dormir ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  let ultimoStatus: number | undefined;
  let ultimoErro: string | undefined;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      const r = await enviarTexto(envio);
      if (r.ok) return { ok: true, tentativas: tentativa, ultimoStatus: r.status };
      ultimoStatus = r.status;
      ultimoErro = `HTTP ${r.status}`;
    } catch (erro) {
      ultimoErro = erro instanceof Error ? erro.message : String(erro);
    }
    if (tentativa < maxTentativas) await dormir(backoffMs(tentativa));
  }

  await registrarFalhaSistema({
    tipo: "whatsapp_envio",
    severidade: "alta",
    mensagem: `Envio de WhatsApp falhou após ${maxTentativas} tentativas (${ultimoErro ?? "erro desconhecido"}).`,
    contexto: { numero: envio.numero, ...(opcoes.contexto ?? {}) },
  });

  return { ok: false, tentativas: maxTentativas, ultimoStatus };
}
