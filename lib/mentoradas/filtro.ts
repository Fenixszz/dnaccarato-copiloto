/**
 * Regra de visibilidade de mentoradas no dashboard.
 *
 * Uma aluna aparece no dashboard A MENOS QUE esteja explicitamente marcada como
 * não-mentorada (`metadata.mentorada === false`). Assim:
 *  - mentoradas reais (fonte da verdade = Drive ∪ Asana CONSULTORIA) → `true`;
 *  - alunas criadas por webhook (Asaas/Calendly/Forms/Autentique) entram com
 *    `mentorada: false` e ficam OCULTAS até serem confirmadas — evita poluir o
 *    dashboard com pagadores/eventos que não são da mentoria;
 *  - sem a flag (import/seed antigos) → visível (retrocompatível).
 */

/**
 * Filtro PostgREST (para `.or(...)` do supabase-js) que mantém visíveis todas as
 * alunas MENOS as marcadas `mentorada: false`. NULL (sem flag) continua visível.
 */
export const FILTRO_MENTORADAS_VISIVEIS =
  "metadata->>mentorada.is.null,metadata->>mentorada.neq.false";

/** Valor de metadata para uma aluna criada por webhook (oculta até confirmar). */
export const METADATA_NAO_MENTORADA = { mentorada: false } as const;

/**
 * Predicado puro equivalente ao filtro acima — visível a menos que a flag seja
 * explicitamente `false` (booleano ou a string "false"). Testado.
 */
export function mentoradaVisivel(metadata: unknown): boolean {
  if (metadata === null || typeof metadata !== "object") return true;
  const m = (metadata as Record<string, unknown>).mentorada;
  return m !== false && m !== "false";
}
