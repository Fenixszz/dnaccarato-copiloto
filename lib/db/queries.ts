import { getServiceClient } from "@/lib/db/client";

/**
 * Queries de acesso ao banco.
 *
 * Inclui o helper de auditoria exigido pelo CLAUDE.md: toda ação de escrita
 * (tools MCP, ações do dashboard) grava na tabela `auditoria` — quem fez,
 * o quê, quando, resultado.
 */

export interface RegistroAuditoria {
  /** Quem executou a ação (usuário do dashboard, "mcp", "cron", etc). */
  ator: string;
  /** O que foi feito (ex: "criar_cobranca", "enviar_whatsapp"). */
  acao: string;
  /** Entidade/alvo afetado, se aplicável (ex: "cobranca:123"). */
  alvo?: string;
  /** Resultado da ação: "sucesso" | "erro". */
  resultado: "sucesso" | "erro";
  /** Detalhes extras sem dados sensíveis (opcional). */
  detalhes?: Record<string, unknown>;
}

/**
 * Grava um registro na tabela de auditoria.
 * O timestamp ("quando") é preenchido pelo banco (default now()).
 */
export async function registrarAuditoria(registro: RegistroAuditoria): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.from("auditoria").insert({
    ator: registro.ator,
    acao: registro.acao,
    alvo: registro.alvo ?? null,
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
