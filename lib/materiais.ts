import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { encontrarMatches } from "@/lib/matching";
import type { MaterialDrive } from "@/lib/integrations/drive";

/**
 * Lógica de materiais compartilhada entre o webhook do Drive e o backfill.
 */

type SupabaseServer = SupabaseClient<Database>;

export interface AlunaMin {
  id: string;
  nome: string;
}

/**
 * Acha a aluna cujo nome casa com o nome da subpasta, usando o motor de
 * matching (normalização + similaridade). Retorna o id ou null se nada bater
 * acima do limiar — NUNCA cria aluna só a partir do nome da pasta.
 */
export function acharAlunaPorNomePasta(
  alunas: readonly AlunaMin[],
  nomePasta: string,
): string | null {
  const matches = encontrarMatches(nomePasta, alunas, (a) => a.nome);
  return matches[0]?.registro.id ?? null;
}

/**
 * Insere o material, deduplicando pelo id do arquivo no Drive
 * (referencia_externa). Se já existir, atualiza nome/tipo/link.
 */
export async function upsertMaterial(
  db: SupabaseServer,
  alunaId: string,
  item: MaterialDrive,
): Promise<void> {
  const registro = {
    aluna_id: alunaId,
    nome_arquivo: item.nomeArquivo,
    tipo: item.tipo,
    link_drive: item.linkDrive,
    referencia_externa: item.fileId,
  };

  const { data, error } = await db
    .from("materiais")
    .select("id")
    .eq("referencia_externa", item.fileId)
    .limit(1);
  if (error) throw new Error(`Falha ao buscar material existente: ${error.message}`);

  const existente = data?.[0];
  if (existente) {
    const { error: eUp } = await db
      .from("materiais")
      .update(registro)
      .eq("id", existente.id);
    if (eUp) throw new Error(`Falha ao atualizar material: ${eUp.message}`);
  } else {
    const { error: eIns } = await db.from("materiais").insert(registro);
    if (eIns) throw new Error(`Falha ao inserir material: ${eIns.message}`);
  }
}
