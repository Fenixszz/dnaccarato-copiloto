/**
 * Rate limiter compartilhado de envios de WhatsApp (CLAUDE.md).
 *
 * QUALQUER envio no projeto passa por aqui — briefing e lembretes, sem exceção.
 * Serializa as tarefas numa fila e garante um intervalo MÍNIMO entre execuções
 * (padrão 3–5s, com jitter para parecer humano e reduzir risco de ban do
 * WhatsApp/Baileys). Nunca dispara em rajada.
 *
 * Observação: é um limiter em memória, por processo. Em ambiente serverless com
 * múltiplas instâncias deve ser reforçado por um limiter distribuído numa
 * sub-fase futura.
 */

export const DELAY_MIN_MS = 3000;
export const DELAY_MAX_MS = 5000;

export interface RateLimiterOpts {
  /** Intervalo mínimo entre envios, em ms. */
  minMs?: number;
  /** Se definido (> minMs), o intervalo é sorteado em [minMs, maxMs] a cada envio. */
  maxMs?: number;
  /** Relógio injetável (para testes). */
  agora?: () => number;
  /** Função de espera injetável (para testes). */
  dormir?: (ms: number) => Promise<void>;
}

export class RateLimiter {
  private cadeia: Promise<void> = Promise.resolve();
  private ultimoEnvio = 0;
  private readonly minMs: number;
  private readonly maxMs: number;
  private readonly agora: () => number;
  private readonly dormir: (ms: number) => Promise<void>;

  constructor(opts: RateLimiterOpts = {}) {
    this.minMs = opts.minMs ?? DELAY_MIN_MS;
    this.maxMs = Math.max(opts.maxMs ?? DELAY_MAX_MS, this.minMs);
    this.agora = opts.agora ?? Date.now;
    this.dormir =
      opts.dormir ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Intervalo alvo deste envio (com jitter, se maxMs > minMs). */
  private intervaloAlvo(): number {
    if (this.maxMs <= this.minMs) return this.minMs;
    // Jitter determinístico-o-suficiente; não precisa de aleatoriedade forte.
    const fracao = (this.agora() % 1000) / 1000;
    return Math.round(this.minMs + fracao * (this.maxMs - this.minMs));
  }

  /**
   * Enfileira uma tarefa. As tarefas rodam em ordem (serialmente), respeitando
   * o intervalo mínimo entre execuções.
   */
  async agendar<T>(tarefa: () => Promise<T>): Promise<T> {
    const resultado = this.cadeia.then(async () => {
      const espera = Math.max(0, this.ultimoEnvio + this.intervaloAlvo() - this.agora());
      if (espera > 0) await this.dormir(espera);
      this.ultimoEnvio = this.agora();
      return tarefa();
    });

    // Mantém a fila viva mesmo se uma tarefa falhar, sem propagar o erro adiante.
    this.cadeia = resultado.then(
      () => undefined,
      () => undefined,
    );

    return resultado;
  }
}

/** Instância única compartilhada por toda a aplicação (3–5s entre envios). */
export const whatsappRateLimiter = new RateLimiter();
