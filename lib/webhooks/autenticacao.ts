import { timingSafeEqual } from "node:crypto";

// Comparação de token em tempo constante, pra não vazar o valor por timing.
// Usada pelos webhooks autenticados por token simples (Asaas, Forms...).
export function tokenValido(recebido: string | null, esperado: string): boolean {
  if (!recebido) {
    return false;
  }
  const bufferRecebido = Buffer.from(recebido);
  const bufferEsperado = Buffer.from(esperado);
  if (bufferRecebido.length !== bufferEsperado.length) {
    return false;
  }
  return timingSafeEqual(bufferRecebido, bufferEsperado);
}
