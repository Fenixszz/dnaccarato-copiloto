/**
 * Gera e registra um token de acesso ao servidor MCP (o que a Anthropic usa como
 * Bearer para chamar as tools). Segurança (CLAUDE.md): só o HASH do token fica no
 * banco (`api_tokens.token_hash`); o valor cru é mostrado UMA vez aqui e você o
 * cola em MCP_ANTHROPIC_TOKEN — ele nunca é persistido.
 *
 * Uso:
 *   npm run mcp:token                       # token com escopo em TODAS as tools
 *   npm run mcp:token -- --somente-leitura  # exclui as tools de escrita
 *   npm run mcp:token -- --nome "Conector X" --expira-dias 365
 *
 * Staging: `npm run mcp:token:staging` (usa o .env.staging).
 *
 * Requer no .env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { getServiceClient } from "@/lib/db/client";
import { hashToken } from "@/lib/mcp/auth";
import { FERRAMENTAS } from "@/lib/mcp/tools";

// Tools que ESCREVEM (alteram dados) — excluídas quando --somente-leitura.
const TOOLS_DE_ESCRITA = new Set([
  "enviar_lembrete_pagamento",
  "criar_task_asana",
  "remarcar_reuniao",
]);

/** Lê o valor de uma flag "--chave valor" do argv (ou undefined). */
function lerFlag(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const nome = lerFlag("nome") ?? "Anthropic (conector MCP)";
  const somenteLeitura = process.argv.includes("--somente-leitura");
  const expiraDias = lerFlag("expira-dias");

  const escopo = FERRAMENTAS.map((f) => f.name).filter(
    (n) => !somenteLeitura || !TOOLS_DE_ESCRITA.has(n),
  );

  let expiraEm: string | null = null;
  if (expiraDias !== undefined) {
    const dias = Number(expiraDias);
    if (!Number.isFinite(dias) || dias <= 0) {
      throw new Error(`--expira-dias inválido: "${expiraDias}" (use um número > 0).`);
    }
    expiraEm = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
  }

  // Token cru: prefixo legível + 32 bytes aleatórios em hex. Só o hash é gravado.
  const tokenCru = `mcpt_${randomBytes(32).toString("hex")}`;

  const db = getServiceClient();
  const { data, error } = await db
    .from("api_tokens")
    .insert({
      nome,
      token_hash: hashToken(tokenCru),
      escopo,
      status: "ativo",
      expira_em: expiraEm,
    })
    .select("id")
    .single();

  if (error !== null) {
    throw new Error(`Falha ao registrar o token: ${error.message}`);
  }

  console.log("\n✅ Token MCP criado e registrado no banco.\n");
  console.log(`   id no banco: ${data.id}`);
  console.log(`   nome:        ${nome}`);
  console.log(
    `   escopo:      ${escopo.length} tool(s)${somenteLeitura ? " (só leitura)" : ""}`,
  );
  console.log(`   expira:      ${expiraEm ?? "nunca"}`);
  console.log("\n────────────────────────────────────────────────────────────");
  console.log("Cole ESTE valor no .env (mostrado só agora, não é recuperável):\n");
  console.log(`MCP_ANTHROPIC_TOKEN="${tokenCru}"`);
  console.log("────────────────────────────────────────────────────────────\n");
}

main().catch((erro: unknown) => {
  console.error("❌ mcp:token falhou:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
