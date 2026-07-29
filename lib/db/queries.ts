import { getServiceClient } from "@/lib/db/client";

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
  detalhes?: Record<string, unknown>;
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
