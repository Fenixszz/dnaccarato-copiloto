import { obterSupabase } from "@/lib/db/supabase";
import type { Json } from "@/lib/db/types";

// Auditoria das tools de escrita do MCP (regra do projeto: toda ação de
// escrita grava quem fez, o quê, quando e o resultado). log_auditoria é
// append-only; "quando" é o criado_em da linha.

export type EntradaDeAuditoria = {
  tokenId: string;
  tokenNome: string;
  acao: string;
  alunaId: string | null;
  resultado: string;
  detalhes?: Record<string, Json | undefined>;
};

export async function registrarAuditoriaMcp(entrada: EntradaDeAuditoria): Promise<void> {
  const { error } = await obterSupabase()
    .from("log_auditoria")
    .insert({
      origem: "mcp",
      acao: entrada.acao,
      aluna_id: entrada.alunaId,
      resultado: entrada.resultado,
      detalhes: {
        token_id: entrada.tokenId,
        token_nome: entrada.tokenNome,
        ...entrada.detalhes,
      } as Json,
    });
  if (error) {
    throw new Error(`Falha ao gravar auditoria: ${error.message}`);
  }
}
