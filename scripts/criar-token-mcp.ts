// Cria um token de acesso ao servidor MCP e grava só o hash em api_tokens.
//
// Uso: npm run mcp:token -- "<nome>" <tool1,tool2,...>
// Ex.: npm run mcp:token -- "claude-desktop-adriana" listar_alunas,dossie_da_aluna
//
// O token é impresso UMA ÚNICA VEZ — guarde no gerenciador de senhas. Pra
// revogar: update api_tokens set status = 'revogado', revogado_em = now().
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/db/types";
import { TOOLS_DISPONIVEIS } from "../lib/mcp/servidor";

async function main(): Promise<void> {
  const nome = process.argv[2];
  const escopoBruto = process.argv[3];
  if (!nome || !escopoBruto) {
    throw new Error(
      `Uso: npm run mcp:token -- "<nome>" <tools separadas por vírgula>\nTools disponíveis: ${TOOLS_DISPONIVEIS.join(", ")}`
    );
  }
  const escopo = escopoBruto.split(",").map((tool) => tool.trim());
  const desconhecidas = escopo.filter(
    (tool) => !(TOOLS_DISPONIVEIS as readonly string[]).includes(tool)
  );
  if (desconhecidas.length > 0) {
    throw new Error(
      `Tools desconhecidas: ${desconhecidas.join(", ")}. Disponíveis: ${TOOLS_DISPONIVEIS.join(", ")}`
    );
  }

  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no .env.local");
  }
  const supabase = createClient<Database>(url, chave);

  const token = `mcp_${randomBytes(32).toString("hex")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { error } = await supabase.from("api_tokens").insert({
    nome,
    token_hash: tokenHash,
    escopo,
    status: "ativo",
  });
  if (error) {
    throw new Error(`Falha ao criar token: ${error.message}`);
  }

  console.log(`Token criado para "${nome}" com escopo [${escopo.join(", ")}].`);
  console.log("");
  console.log(`  ${token}`);
  console.log("");
  console.log("Este valor NÃO será mostrado de novo — só o hash fica no banco.");
}

main().catch((erro: unknown) => {
  console.error(`Criação do token falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exit(1);
});
