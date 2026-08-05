import { similaridadeNomes, LIMIAR_MATCH_PADRAO } from "@/lib/matching";

/**
 * Matching fuzzy de pessoas combinando nome + email + telefone.
 *
 * Cada sinal é normalizado antes de comparar:
 *  - nome: sem acento, minúsculas, similaridade por tokens (via lib/matching).
 *  - email: aparado + minúsculas, comparação exata.
 *  - telefone: só dígitos; casa por igualdade OU sufixo (tolera DDI/máscara).
 *
 * A pontuação usa os identificadores fortes (email/telefone) como decisivos e
 * o nome como fuzzy; quando um identificador forte concorda E o nome é
 * plausível, a confiança vira praticamente certeza.
 */

export interface Candidato {
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
}

/** Mantém só os dígitos do telefone. */
export function normalizarTelefone(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

/** Apara e passa o email para minúsculas. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Dois emails casam se, normalizados, forem iguais. */
export function emailsCasam(a: string, b: string): boolean {
  const na = normalizarEmail(a);
  const nb = normalizarEmail(b);
  return na.length > 0 && na === nb;
}

/**
 * Dois telefones casam por igualdade de dígitos ou por sufixo (o menor é
 * sufixo do maior) — isso tolera a presença/ausência de DDI (+55) e de máscara.
 * Para o sufixo exige-se pelo menos 10 dígitos no menor, evitando colisões.
 */
export function telefonesCasam(a: string, b: string): boolean {
  const da = normalizarTelefone(a);
  const db = normalizarTelefone(b);
  if (da.length < 8 || db.length < 8) return false;
  if (da === db) return true;

  const [maior, menor] = da.length >= db.length ? [da, db] : [db, da];
  return menor.length >= 10 && maior.endsWith(menor);
}

export interface ResultadoPontuacao {
  score: number;
  emailIgual: boolean;
  telefoneIgual: boolean;
  nomeSimilaridade: number;
}

/** Pontua o quão provável é que dois candidatos sejam a mesma pessoa (0..1). */
export function pontuarMatch(a: Candidato, b: Candidato): ResultadoPontuacao {
  const emailIgual = a.email != null && b.email != null && emailsCasam(a.email, b.email);
  const telefoneIgual =
    a.telefone != null && b.telefone != null && telefonesCasam(a.telefone, b.telefone);
  const nomeSimilaridade =
    a.nome != null && b.nome != null ? similaridadeNomes(a.nome, b.nome) : 0;

  // Base: o nome (fuzzy). Identificadores fortes elevam o piso.
  let score = nomeSimilaridade;
  if (emailIgual) score = Math.max(score, 0.95);
  if (telefoneIgual) score = Math.max(score, 0.9);
  // Identificador forte + nome plausível → praticamente certeza.
  if ((emailIgual || telefoneIgual) && nomeSimilaridade >= 0.5) score = 1;

  return { score, emailIgual, telefoneIgual, nomeSimilaridade };
}

/** Decide se dois candidatos são a mesma pessoa, comparando com um limiar. */
export function candidatosCasam(
  a: Candidato,
  b: Candidato,
  limiar: number = LIMIAR_MATCH_PADRAO,
): boolean {
  return pontuarMatch(a, b).score >= limiar;
}

export interface MelhorMatch<T> {
  registro: T;
  score: number;
}

/**
 * Dado um candidato e uma lista, retorna o registro de maior score acima do
 * limiar, ou null se nenhum casar.
 */
export function encontrarMelhorMatch<T>(
  candidato: Candidato,
  lista: readonly T[],
  extrair: (registro: T) => Candidato,
  limiar: number = LIMIAR_MATCH_PADRAO,
): MelhorMatch<T> | null {
  let melhor: MelhorMatch<T> | null = null;
  for (const registro of lista) {
    const { score } = pontuarMatch(candidato, extrair(registro));
    if (score >= limiar && (melhor === null || score > melhor.score)) {
      melhor = { registro, score };
    }
  }
  return melhor;
}
