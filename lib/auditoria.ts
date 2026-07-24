import { obterSupabase } from "@/lib/db/supabase";
import type { Json } from "@/lib/db/types";

// Auditoria de toda ação de escrita (regra do projeto). O "ator" identifica
// quem fez: uma tool MCP (com o token) ou uma ação do dashboard (com o email
// do usuário logado). log_auditoria é append-only; "quando" é o criado_em.

export type Ator =
  { origem: "mcp"; tokenId: string; tokenNome: string } | { origem: "dashboard"; usuario: string };

export async function registrarAuditoria(
  ator: Ator,
  acao: string,
  alunaId: string | null,
  resultado: string
): Promise<void> {
  const detalhes =
    ator.origem === "mcp"
      ? { token_id: ator.tokenId, token_nome: ator.tokenNome }
      : { usuario: ator.usuario };

  const { error } = await obterSupabase()
    .from("log_auditoria")
    .insert({
      origem: ator.origem,
      acao,
      aluna_id: alunaId,
      resultado,
      detalhes: detalhes as Json,
    });
  if (error) {
    throw new Error(`Falha ao gravar auditoria: ${error.message}`);
  }
}
