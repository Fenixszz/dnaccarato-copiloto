/**
 * Importa a lista real de alunas ativas (da Adriana) para a tabela `alunas`,
 * pra o sistema não começar vazio esperando webhooks.
 *
 * Uso:  npm run importar:alunas -- <caminho-do-arquivo>
 * Formatos aceitos: .csv (com cabeçalho nome,email,telefone) ou .json (array
 * de objetos { nome, email, telefone }).
 *
 * Comportamento: valida tudo com Zod ANTES de escrever. Se algum registro for
 * inválido, aborta sem inserir nada e lista os problemas. Alunas já existentes
 * (por email) são atualizadas (nome/telefone); as novas são inseridas.
 *
 * As funções de parsing/validação são exportadas e testadas em
 * tests/scripts/importar-alunas.test.ts.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireEnv } from "../lib/env";
import type { Database, TablesInsert } from "../lib/db/types";

export interface AlunaImport {
  nome: string;
  email?: string;
  telefone?: string;
}

/** Schema de validação de cada aluna importada. */
export const alunaImportSchema = z.object({
  nome: z.string().trim().min(1, "nome é obrigatório"),
  email: z
    .string()
    .trim()
    .email("email inválido")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  telefone: z
    .string()
    .trim()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

/** Quebra UMA linha de CSV em campos, respeitando aspas e vírgulas escapadas. */
export function parseLinhaCSV(linha: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let emAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (emAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          emAspas = false;
        }
      } else {
        atual += c;
      }
    } else if (c === '"') {
      emAspas = true;
    } else if (c === ",") {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos;
}

/** Converte um CSV (com cabeçalho) em registros crus indexados pelo cabeçalho. */
export function parseCSV(conteudo: string): Record<string, string>[] {
  const linhas = conteudo.split(/\r?\n/).filter((l) => l.trim() !== "");
  const cabecalho = linhas[0];
  if (cabecalho === undefined) return [];

  const colunas = parseLinhaCSV(cabecalho).map((h) => h.trim().toLowerCase());
  const registros: Record<string, string>[] = [];
  for (const linha of linhas.slice(1)) {
    const valores = parseLinhaCSV(linha);
    const registro: Record<string, string> = {};
    colunas.forEach((coluna, i) => {
      registro[coluna] = (valores[i] ?? "").trim();
    });
    registros.push(registro);
  }
  return registros;
}

/** Faz o parse do conteúdo do arquivo conforme o formato, sem validar ainda. */
export function parseArquivo(conteudo: string, formato: "csv" | "json"): unknown[] {
  if (formato === "json") {
    const dados: unknown = JSON.parse(conteudo);
    if (!Array.isArray(dados)) {
      throw new Error("JSON precisa ser um array de objetos { nome, email, telefone }.");
    }
    return dados;
  }
  return parseCSV(conteudo);
}

export interface ResultadoValidacao {
  validas: AlunaImport[];
  erros: { linha: number; problema: string }[];
}

/** Valida cada registro com Zod, acumulando erros com o número da linha. */
export function validarAlunas(registros: unknown[]): ResultadoValidacao {
  const validas: AlunaImport[] = [];
  const erros: { linha: number; problema: string }[] = [];
  registros.forEach((registro, i) => {
    const r = alunaImportSchema.safeParse(registro);
    if (r.success) {
      validas.push(r.data);
    } else {
      const problema = r.error.issues
        .map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
        .join("; ");
      erros.push({ linha: i + 2, problema }); // +2: 1-based + cabeçalho
    }
  });
  return { validas, erros };
}

/** Descobre o formato pelo sufixo do arquivo. */
export function formatoDoArquivo(caminho: string): "csv" | "json" {
  return path.extname(caminho).toLowerCase() === ".json" ? "json" : "csv";
}

async function main(): Promise<void> {
  const caminho = process.argv[2];
  if (!caminho) {
    console.error(
      "Uso: npm run importar:alunas -- <arquivo.csv|arquivo.json>\n" +
        "CSV com cabeçalho: nome,email,telefone",
    );
    process.exit(1);
  }

  const conteudo = readFileSync(caminho, "utf8");
  const registros = parseArquivo(conteudo, formatoDoArquivo(caminho));
  const { validas, erros } = validarAlunas(registros);

  if (erros.length > 0) {
    console.error(`❌ ${erros.length} registro(s) inválido(s). Nada foi importado:`);
    for (const e of erros) console.error(`  - linha ${e.linha}: ${e.problema}`);
    process.exit(1);
  }

  if (validas.length === 0) {
    console.log("Nenhuma aluna no arquivo. Nada a importar.");
    return;
  }

  const db = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Descobre quais emails já existem para separar inserção de atualização.
  const emails = validas.map((a) => a.email).filter((e): e is string => Boolean(e));
  const { data: existentes, error: eSel } = await db
    .from("alunas")
    .select("id, email")
    .in("email", emails.length > 0 ? emails : ["__nenhum__"]);
  if (eSel) throw new Error(`Falha ao consultar alunas existentes: ${eSel.message}`);

  const idPorEmail = new Map<string, string>();
  for (const linha of existentes ?? []) {
    if (linha.email) idPorEmail.set(linha.email, linha.id);
  }

  const novas: TablesInsert<"alunas">[] = [];
  let atualizadas = 0;
  for (const aluna of validas) {
    const idExistente = aluna.email ? idPorEmail.get(aluna.email) : undefined;
    if (idExistente) {
      const { error } = await db
        .from("alunas")
        .update({ nome: aluna.nome, telefone: aluna.telefone ?? null })
        .eq("id", idExistente);
      if (error) throw new Error(`Falha ao atualizar ${aluna.email}: ${error.message}`);
      atualizadas++;
    } else {
      novas.push({
        nome: aluna.nome,
        email: aluna.email ?? null,
        telefone: aluna.telefone ?? null,
      });
    }
  }

  if (novas.length > 0) {
    const { error } = await db.from("alunas").insert(novas);
    if (error) throw new Error(`Falha ao inserir alunas novas: ${error.message}`);
  }

  console.log(
    `✅ Importação concluída: ${novas.length} inserida(s), ${atualizadas} atualizada(s).`,
  );
}

// Só executa main() quando rodado diretamente (não quando importado nos testes).
const executadoDireto =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (executadoDireto) {
  main().catch((erro: unknown) => {
    console.error("❌ Importação falhou:", erro instanceof Error ? erro.message : erro);
    process.exit(1);
  });
}
