/**
 * Cruzamento de nomes entre sistemas (Asaas, Autentique, Calendly, Asana, ...).
 *
 * O mesmo cliente aparece escrito de formas diferentes em cada sistema
 * ("Maria D'Ávila", "maria davila", "MARIA DE AVILA"). Este módulo normaliza
 * e compara nomes para decidir se referem à mesma pessoa.
 *
 * É lógica de negócio relevante → tem teste unitário (CLAUDE.md).
 */

/**
 * Normaliza um nome para comparação:
 * - remove acentos/diacríticos;
 * - passa para minúsculas;
 * - troca qualquer caractere não alfanumérico por espaço;
 * - colapsa espaços e apara as pontas.
 */
export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // remove diacríticos (marcas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Divide um nome normalizado em tokens (palavras). */
export function tokensNome(nome: string): string[] {
  const normalizado = normalizarNome(nome);
  return normalizado === "" ? [] : normalizado.split(" ");
}

/**
 * Similaridade entre dois nomes, de 0 (nada a ver) a 1 (idênticos após
 * normalização). Usa índice de Jaccard sobre os tokens: robusto a ordem de
 * nome/sobrenome e a acentuação, sem depender de distância de edição cara.
 */
export function similaridadeNomes(a: string, b: string): number {
  const tokensA = new Set(tokensNome(a));
  const tokensB = new Set(tokensNome(b));

  if (tokensA.size === 0 && tokensB.size === 0) {
    return 1;
  }
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let intersecao = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersecao += 1;
    }
  }
  const uniao = tokensA.size + tokensB.size - intersecao;
  return intersecao / uniao;
}

/** Limiar padrão a partir do qual dois nomes são considerados o mesmo. */
export const LIMIAR_MATCH_PADRAO = 0.6;

/**
 * Decide se dois nomes provavelmente são a mesma pessoa, comparando a
 * similaridade com um limiar configurável.
 */
export function mesmoNome(
  a: string,
  b: string,
  limiar: number = LIMIAR_MATCH_PADRAO,
): boolean {
  return similaridadeNomes(a, b) >= limiar;
}

export interface CandidatoMatch<T> {
  registro: T;
  score: number;
}

/**
 * Dado um nome de referência e uma lista de candidatos, retorna os candidatos
 * cujo nome bate acima do limiar, ordenados do mais parecido para o menos.
 */
export function encontrarMatches<T>(
  nomeReferencia: string,
  candidatos: readonly T[],
  extrairNome: (registro: T) => string,
  limiar: number = LIMIAR_MATCH_PADRAO,
): Array<CandidatoMatch<T>> {
  return candidatos
    .map((registro) => ({
      registro,
      score: similaridadeNomes(nomeReferencia, extrairNome(registro)),
    }))
    .filter((candidato) => candidato.score >= limiar)
    .sort((x, y) => y.score - x.score);
}
