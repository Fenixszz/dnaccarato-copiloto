// Espera assíncrona, isolada num módulo próprio pra ser mockável nos testes
// (o backoff de reenvio não deve adicionar delays reais na suíte).
export function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
