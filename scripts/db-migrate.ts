/**
 * Aplica as migrations de supabase/migrations no banco apontado por
 * SUPABASE_DB_URL, quando o Supabase CLI não está disponível no ambiente.
 *
 * Uso:  npm run db:migrate
 * Requer: SUPABASE_DB_URL no .env (string de conexão Postgres do projeto).
 *
 * Idempotente: mantém uma tabela de controle (_migracoes_aplicadas) e só roda
 * o que ainda não foi aplicado, em ordem de nome de arquivo. As migrations do
 * projeto já são idempotentes (create ... if not exists / drop ... if exists),
 * então adotar um schema já existente é seguro.
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { requireEnv } from "../lib/env";

const DIR = join(process.cwd(), "supabase", "migrations");

async function main(): Promise<void> {
  const client = new Client({
    connectionString: requireEnv("SUPABASE_DB_URL"),
    ssl: { rejectUnauthorized: false }, // Supabase exige TLS
  });
  await client.connect();

  try {
    await client.query(`
      create table if not exists public._migracoes_aplicadas (
        nome        text primary key,
        aplicada_em timestamptz not null default now()
      );
    `);

    const { rows } = await client.query<{ nome: string }>(
      "select nome from public._migracoes_aplicadas",
    );
    const jaAplicadas = new Set(rows.map((r) => r.nome));

    const arquivos = readdirSync(DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let aplicadas = 0;
    for (const arquivo of arquivos) {
      if (jaAplicadas.has(arquivo)) continue;

      const sql = readFileSync(join(DIR, arquivo), "utf8");
      process.stdout.write(`→ ${arquivo} … `);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into public._migracoes_aplicadas (nome) values ($1)", [
          arquivo,
        ]);
        await client.query("commit");
        console.log("ok");
        aplicadas += 1;
      } catch (erro) {
        await client.query("rollback");
        throw new Error(
          `Falha na migration ${arquivo}: ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }
    }

    console.log(
      aplicadas === 0
        ? "Nada a aplicar — banco já está em dia."
        : `✅ ${aplicadas} migration(s) aplicada(s).`,
    );
  } finally {
    await client.end();
  }
}

main().catch((erro: unknown) => {
  console.error("❌ db:migrate falhou:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
