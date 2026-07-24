import { obterSupabase } from "@/lib/db/supabase";
import { normalizarEmail, normalizarTelefone } from "@/lib/matching/contatos";
import { normalizarNome } from "@/lib/matching/nomes";

export type AlunaLista = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
};

// Busca "contém" por nome (sem acento/caixa), email ou telefone (só dígitos).
// Filtro em JS: na escala de uma clínica, listar tudo e filtrar aqui reusa a
// normalização já testada e é simples de manter.
export function filtrarAlunas(alunas: AlunaLista[], termo: string): AlunaLista[] {
  const alvo = termo.trim();
  if (alvo === "") {
    return alunas;
  }
  const nomeAlvo = normalizarNome(alvo);
  const emailAlvo = normalizarEmail(alvo);
  const digitosAlvo = normalizarTelefone(alvo);

  return alunas.filter((aluna) => {
    if (nomeAlvo !== "" && normalizarNome(aluna.nome).includes(nomeAlvo)) {
      return true;
    }
    if (aluna.email && emailAlvo !== "" && normalizarEmail(aluna.email).includes(emailAlvo)) {
      return true;
    }
    if (
      digitosAlvo !== "" &&
      aluna.telefone &&
      normalizarTelefone(aluna.telefone).includes(digitosAlvo)
    ) {
      return true;
    }
    return false;
  });
}

export async function listarAlunas(): Promise<AlunaLista[]> {
  const { data, error } = await obterSupabase()
    .from("alunas")
    .select("id, nome, email, telefone")
    .order("nome");
  if (error) {
    throw new Error(`Falha ao listar alunas: ${error.message}`);
  }
  return data ?? [];
}
