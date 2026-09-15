/**
 * Backfill de materiais: percorre a pasta raiz já existente da Adriana (uma
 * subpasta por aluna), casa cada subpasta com a aluna pelo NOME (motor de
 * matching) e grava um registro em `materiais` para cada arquivo já existente.
 *
 * Subpastas sem match são listadas como "não identificadas" — NÃO cria aluna
 * nova só com base no nome da pasta.
 *
 * Uso:  npm run backfill:materiais
 * Requer no .env: credenciais Google, DRIVE_ROOT_FOLDER_ID e Supabase.
 */
import "dotenv/config";
import { requireEnv } from "@/lib/env";
import { getServiceClient } from "@/lib/db/client";
import {
  idDePasta,
  listarSubpastas,
  listarArquivosDaPasta,
} from "@/lib/integrations/drive";
import { acharAlunaPorNomePasta, upsertMaterial } from "@/lib/materiais";

async function main(): Promise<void> {
  // DRIVE_ROOT_FOLDER_ID pode ser a URL do "Compartilhar"; extrai só o ID
  // (mesmo tratamento do webhook em coletarNovosMateriais).
  const root = idDePasta(requireEnv("DRIVE_ROOT_FOLDER_ID"));
  const db = getServiceClient();

  const { data: alunas, error } = await db.from("alunas").select("id, nome");
  if (error) throw new Error(`Falha ao carregar alunas: ${error.message}`);
  const listaAlunas = alunas ?? [];

  const subpastas = await listarSubpastas(root);
  console.log(`Encontradas ${subpastas.length} subpastas na raiz.\n`);

  const naoIdentificadas: string[] = [];
  let subCasadas = 0;
  let totalMateriais = 0;

  for (const sub of subpastas) {
    const nome = sub.name ?? "(sem nome)";
    const alunaId = acharAlunaPorNomePasta(listaAlunas, nome);
    if (!alunaId) {
      naoIdentificadas.push(nome);
      continue;
    }
    subCasadas += 1;
    const arquivos = await listarArquivosDaPasta(sub.id);
    for (const arq of arquivos) {
      await upsertMaterial(db, alunaId, {
        fileId: arq.id,
        nomeArquivo: arq.name ?? "(sem nome)",
        tipo: arq.mimeType ?? null,
        linkDrive: arq.webViewLink ?? null,
        subpastaNome: nome,
      });
      totalMateriais += 1;
    }
    console.log(`  ✓ ${nome}: ${arquivos.length} arquivo(s)`);
  }

  console.log(
    `\nResumo: ${subCasadas}/${subpastas.length} subpastas casadas, ${totalMateriais} materiais gravados.`,
  );
  if (naoIdentificadas.length > 0) {
    console.log(
      `\nSubpastas NÃO identificadas (${naoIdentificadas.length}) — nenhuma aluna criada:`,
    );
    for (const nome of naoIdentificadas) console.log(`  - ${nome}`);
  }
}

main().catch((erro: unknown) => {
  console.error("❌ Falhou:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
