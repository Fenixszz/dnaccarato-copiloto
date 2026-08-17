/**
 * Estimativa de custo (em centavos de real) do consumo de crédito.
 *
 * As funções aqui são PURAS (recebem as tarifas como parâmetro) → testáveis.
 * As tarifas em si vêm de variável de ambiente (ver `tarifasDoEnv`), porque são
 * estimativas que a Adriana/o João ajustam conforme a tabela vigente e o câmbio.
 */
import { optionalEnv } from "@/lib/env";

/** Tarifas usadas na estimativa de custo. */
export interface Tarifas {
  /** Custo por 1 milhão de tokens de ENTRADA da Anthropic, em centavos. */
  anthropicInputCentavosPorMTok: number;
  /** Custo por 1 milhão de tokens de SAÍDA da Anthropic, em centavos. */
  anthropicOutputCentavosPorMTok: number;
  /** Custo estimado por mensagem enviada no WhatsApp, em centavos. */
  whatsappCentavosPorMsg: number;
}

/** Uso de tokens de uma chamada à Anthropic (campos de `usage`). */
export interface UsoAnthropic {
  inputTokens: number;
  outputTokens: number;
  /** Tokens lidos do cache (cobrados a ~0,1x do input). */
  cacheReadTokens?: number;
  /** Tokens escritos no cache (cobrados a ~1,25x do input). */
  cacheCreationTokens?: number;
}

const UM_MILHAO = 1_000_000;

/**
 * Estimativa, em centavos, do custo de uma chamada à Anthropic a partir do
 * `usage` retornado. Cache read entra a 0,1x e cache creation a 1,25x da tarifa
 * de input (multiplicadores padrão da Anthropic). Arredonda pra cima (o medidor
 * nunca subestima o gasto). Sempre >= 0.
 */
export function estimarCustoAnthropicCentavos(
  uso: UsoAnthropic,
  tarifas: Tarifas,
): number {
  const input = Math.max(0, uso.inputTokens);
  const output = Math.max(0, uso.outputTokens);
  const cacheRead = Math.max(0, uso.cacheReadTokens ?? 0);
  const cacheCreation = Math.max(0, uso.cacheCreationTokens ?? 0);

  const custo =
    (input * tarifas.anthropicInputCentavosPorMTok) / UM_MILHAO +
    (output * tarifas.anthropicOutputCentavosPorMTok) / UM_MILHAO +
    (cacheRead * tarifas.anthropicInputCentavosPorMTok * 0.1) / UM_MILHAO +
    (cacheCreation * tarifas.anthropicInputCentavosPorMTok * 1.25) / UM_MILHAO;

  return Math.max(0, Math.ceil(custo));
}

/** Custo estimado (centavos) de uma mensagem de WhatsApp. */
export function custoWhatsappCentavos(tarifas: Tarifas): number {
  return Math.max(0, Math.round(tarifas.whatsappCentavosPorMsg));
}

/**
 * Lê as tarifas do ambiente, com defaults baseados no preço do Opus 4.8
 * (US$ 5 / US$ 25 por 1M tokens) a ~R$ 5,40/US$ → 2700 / 13500 centavos por
 * 1M tokens. São ESTIMATIVAS — ajuste as variáveis conforme a realidade.
 */
export function tarifasDoEnv(): Tarifas {
  return {
    anthropicInputCentavosPorMTok: Number(
      optionalEnv("CREDITO_ANTHROPIC_INPUT_CENTAVOS_POR_MTOK", "2700"),
    ),
    anthropicOutputCentavosPorMTok: Number(
      optionalEnv("CREDITO_ANTHROPIC_OUTPUT_CENTAVOS_POR_MTOK", "13500"),
    ),
    whatsappCentavosPorMsg: Number(optionalEnv("CREDITO_WHATSAPP_CENTAVOS_POR_MSG", "5")),
  };
}
