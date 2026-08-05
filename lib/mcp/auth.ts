import { createHash } from "node:crypto";
import { getServiceClient } from "@/lib/db/client";

/**
 * Autenticação Bearer do servidor MCP contra a tabela `api_tokens`.
 * Guardamos só o hash do token (SHA-256); nunca o valor cru.
 */

export interface TokenAutenticado {
  id: string;
  /** Tools que este token pode chamar. */
  escopo: string[];
}

/** SHA-256 hex do token cru — é o que fica em api_tokens.token_hash. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Valida o header Authorization. Retorna o token (id + escopo) se for válido,
 * ativo e não expirado; caso contrário null. Nunca revela por que falhou.
 */
export async function autenticarBearer(
  authorization: string | null,
): Promise<TokenAutenticado | null> {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  const token = (match?.[1] ?? "").trim();
  if (!token) return null;

  const db = getServiceClient();
  const { data, error } = await db
    .from("api_tokens")
    .select("id, escopo, status, expira_em")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error) throw new Error(`Falha ao validar token: ${error.message}`);
  if (!data) return null;
  if (data.status !== "ativo") return null;
  if (data.expira_em != null && Date.parse(data.expira_em) < Date.now()) return null;

  return { id: data.id, escopo: data.escopo };
}
