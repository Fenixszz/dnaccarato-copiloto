/**
 * Rate limiter compartilhado para envios de WhatsApp (CLAUDE.md).
 *
 * Toda rota que envia mensagem via WhatsApp passa por este limiter — nunca
 * dispara em rajada. Implementação simples de fila serial com espaçamento
 * mínimo entre envios (token-bucket temporal em processo).
 *
 * Observação: é um limiter em memória, por processo. Em ambiente serverless
 * com múltiplas instâncias, deve ser substituído/reforçado por um limiter
 * distribuído (ex: baseado no Supabase/Redis) numa sub-fase futura.
 */

export interface RateLimiterConfig {
  /** Intervalo mínimo entre dois envios, em milissegundos. */
  intervaloMinimoMs: number;
}

const CONFIG_PADRAO: RateLimiterConfig = {
  // ~1 mensagem por segundo por padrão.
  intervaloMinimoMs: 1000,
};

export class RateLimiter {
  private readonly intervaloMinimoMs: number;
  private cadeia: Promise<void> = Promise.resolve();
  private ultimoEnvio = 0;

  constructor(config: RateLimiterConfig = CONFIG_PADRAO) {
    this.intervaloMinimoMs = config.intervaloMinimoMs;
  }

  /**
   * Enfileira uma tarefa respeitando o intervalo mínimo entre execuções.
   * As tarefas rodam em ordem (serialmente), nunca em rajada.
   */
  async agendar<T>(tarefa: () => Promise<T>): Promise<T> {
    const resultado = this.cadeia.then(async () => {
      const agora = Date.now();
      const espera = Math.max(0, this.ultimoEnvio + this.intervaloMinimoMs - agora);
      if (espera > 0) {
        await new Promise((resolve) => setTimeout(resolve, espera));
      }
      this.ultimoEnvio = Date.now();
      return tarefa();
    });

    // Mantém a cadeia viva mesmo que uma tarefa falhe, sem propagar o erro
    // para os próximos agendamentos.
    this.cadeia = resultado.then(
      () => undefined,
      () => undefined,
    );

    return resultado;
  }
}

/** Instância única compartilhada por toda a aplicação. */
export const whatsappRateLimiter = new RateLimiter();
