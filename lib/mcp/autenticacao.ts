import { createHash } from "node:crypto";
import { obterSupabase } from "@/lib/db/supabase";

// Autenticação do servidor MCP: Bearer token validado contra api_tokens.
// Só o hash SHA-256 do token fica no banco (o valor em claro é mostrado uma
// única vez na criação — scripts/criar-token-mcp.ts).

export function hashDeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type TokenMcp = {
  id: string;
  nome: string;
  escopo: string[];
};

// Retorna o token autenticado ou null (ausente, desconhecido ou revogado).
// Erro de banco estoura pra rota responder 500.
export async function autenticarTokenMcp(
  cabecalhoAuthorization: string | null
): Promise<TokenMcp | null> {
  if (!cabecalhoAuthorization?.startsWith("Bearer ")) {
    return null;
  }
  const token = cabecalhoAuthorization.slice("Bearer ".length).trim();
  if (token === "") {
    return null;
  }
  const { data, error } = await obterSupabase()
    .from("api_tokens")
    .select("id, nome, escopo, status")
    .eq("token_hash", hashDeToken(token))
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao consultar api_tokens: ${error.message}`);
  }
  if (data === null || data.status !== "ativo") {
    return null;
  }
  return { id: data.id, nome: data.nome, escopo: data.escopo };
}
