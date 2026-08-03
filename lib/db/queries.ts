import { getServiceClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";

/**
 * Lê um valor de estado de integração (ex: "drive_page_token"). Retorna null
 * se a chave não existe.
 */
export async function lerEstado(chave: string): Promise<Json | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("estado_integracoes")
    .select("valor")
    .eq("chave", chave)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler estado (${chave}): ${error.message}`);
  return data?.valor ?? null;
}

/** Grava (upsert) um valor de estado de integração. */
export async function salvarEstado(chave: string, valor: Json): Promise<void> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("estado_integracoes")
    .select("chave")
    .eq("chave", chave)
    .limit(1);
  if (error) throw new Error(`Falha ao ler estado (${chave}): ${error.message}`);

  if (data?.[0]) {
    const { error: eUp } = await db
      .from("estado_integracoes")
      .update({ valor })
      .eq("chave", chave);
    if (eUp) throw new Error(`Falha ao atualizar estado (${chave}): ${eUp.message}`);
  } else {
    const { error: eIns } = await db.from("estado_integracoes").insert({ chave, valor });
    if (eIns) throw new Error(`Falha ao inserir estado (${chave}): ${eIns.message}`);
  }
}

/**
 * Queries de acesso ao banco.
 *
 * Inclui o helper de auditoria exigido pelo CLAUDE.md: toda ação de escrita
 * (tools MCP, ações do dashboard, cron) grava na tabela `log_auditoria` —
 * de onde veio (origem), o quê (acao), sobre quem (aluna_id), resultado e quando.
 */

export interface RegistroAuditoria {
  /** De onde veio a ação: "mcp" | "dashboard" | "cron". */
  origem: "mcp" | "dashboard" | "cron";
  /** O que foi feito (ex: "criar_cobranca", "enviar_whatsapp"). */
  acao: string;
  /** Aluna afetada, se aplicável (uuid). Nulo quando a ação não é sobre uma aluna. */
  alunaId?: string;
  /** Resultado da ação: "sucesso" | "erro". */
  resultado: "sucesso" | "erro";
  /** Detalhes extras sem dados sensíveis (opcional). */
  detalhes?: Json;
}

/**
 * Grava um registro na tabela `log_auditoria`.
 * O timestamp ("quando") é preenchido pelo banco (default now()).
 */
export async function registrarAuditoria(registro: RegistroAuditoria): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.from("log_auditoria").insert({
    origem: registro.origem,
    acao: registro.acao,
    aluna_id: registro.alunaId ?? null,
    resultado: registro.resultado,
    detalhes: registro.detalhes ?? {},
  });

  if (error !== null) {
    // Falha de auditoria não deve ser silenciosa, mas também não deve derrubar
    // a operação principal — logamos com contexto e seguimos.
    console.error(
      JSON.stringify({
        nivel: "error",
        timestamp: new Date().toISOString(),
        contexto: "registrarAuditoria",
        acao: registro.acao,
        erro: error.message,
      }),
    );
  }
}
