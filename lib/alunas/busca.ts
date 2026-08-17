/**
 * Busca de alunas por nome, e-mail ou telefone.
 *
 * É lógica de negócio (matching de texto) → função pura e testada. A filtragem
 * roda em memória sobre a lista já carregada do banco: a base de alunas de um
 * escritório é pequena, e assim conseguimos casar telefone COM ou SEM máscara
 * (comparando só os dígitos), o que um `ilike` no SQL não faria.
 */
import { normalizarNome } from "@/lib/matching";
import { normalizarTelefone } from "@/lib/matching/matcher";

/** Aluna no formato exibido na lista (subconjunto do cadastro). */
export interface AlunaLista {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  criado_em: string;
}

/**
 * Decide se uma aluna casa com o termo de busca. Termo vazio casa com todas.
 * Casa por:
 *  - nome: todos os termos presentes (cada um como substring), após
 *    normalização (sem acento, minúsculas) — "Ana Prado" acha "Ana D'Ávila
 *    Prado" e "prad" acha "Prado";
 *  - e-mail: substring, minúsculas;
 *  - telefone: substring dos dígitos (ignora máscara/DDI).
 */
export function alunaCasaBusca(
  aluna: Pick<AlunaLista, "nome" | "email" | "telefone">,
  termoBruto: string,
): boolean {
  const termo = termoBruto.trim();
  if (termo === "") return true;

  const nomeNormalizado = normalizarNome(aluna.nome);
  const termosNome = normalizarNome(termo)
    .split(" ")
    .filter((t) => t !== "");
  if (termosNome.length > 0 && termosNome.every((t) => nomeNormalizado.includes(t))) {
    return true;
  }

  const termoEmail = termo.toLowerCase();
  if (aluna.email !== null && aluna.email.toLowerCase().includes(termoEmail)) {
    return true;
  }

  const termoDigitos = normalizarTelefone(termo);
  if (
    termoDigitos !== "" &&
    aluna.telefone !== null &&
    normalizarTelefone(aluna.telefone).includes(termoDigitos)
  ) {
    return true;
  }

  return false;
}

/** Filtra (preservando a ordem) as alunas que casam com o termo. */
export function filtrarAlunas<T extends Pick<AlunaLista, "nome" | "email" | "telefone">>(
  alunas: readonly T[],
  termo: string,
): T[] {
  return alunas.filter((a) => alunaCasaBusca(a, termo));
}
