"use server";

import { acharFerramenta } from "@/lib/mcp/tools";
import { executarFerramentaAuditada } from "@/lib/mcp/executar";
import { logarErro } from "@/lib/webhooks/validation";

export interface EstadoAcao {
  ok: boolean;
  mensagem: string | null;
}
// Obs.: um arquivo "use server" só pode exportar funções async. O estado
// inicial do useFormState fica no client (acoes-furo.tsx), não aqui.

// Só estas tools de escrita podem ser disparadas pelos botões da tela de furos.
const ACOES_PERMITIDAS = ["enviar_lembrete_pagamento", "criar_task_asana"] as const;

const MENSAGEM_SUCESSO: Record<string, string> = {
  enviar_lembrete_pagamento: "Lembrete enviado pela WhatsApp.",
  criar_task_asana: "Task criada no Asana.",
};

/**
 * Ação rápida da tela de furos: dispara uma tool MCP de escrita a partir do
 * dashboard (auditada com origem "dashboard"). O nome da ação vem do próprio
 * botão (name="acao"). Valida a entrada com o argsSchema da ferramenta antes de
 * executar; erros de negócio voltam como mensagem clara na própria linha.
 */
export async function acaoRapida(
  _prev: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const acao = String(formData.get("acao") ?? "");
  const ferramenta = acharFerramenta(acao);
  if (
    !ferramenta ||
    !ACOES_PERMITIDAS.includes(acao as (typeof ACOES_PERMITIDAS)[number])
  ) {
    return { ok: false, mensagem: "Ação inválida." };
  }

  const alunaId = String(formData.get("aluna_id") ?? "");
  const argsBrutos =
    acao === "criar_task_asana"
      ? {
          aluna_id: alunaId,
          titulo: String(formData.get("titulo") ?? ""),
          descricao: formData.get("descricao")
            ? String(formData.get("descricao"))
            : undefined,
        }
      : { aluna_id: alunaId };

  const args = ferramenta.argsSchema.safeParse(argsBrutos);
  if (!args.success) {
    return { ok: false, mensagem: "Dados inválidos para a ação." };
  }

  const exec = await executarFerramentaAuditada({
    ferramenta,
    args: args.data,
    origem: "dashboard",
    alunaId,
    detalhesBase: { por: "acao_rapida_furos" },
  });

  if (exec.ok) {
    return { ok: true, mensagem: MENSAGEM_SUCESSO[acao] ?? "Ação concluída." };
  }
  if (exec.erroNegocio !== undefined) {
    return { ok: false, mensagem: exec.erroNegocio };
  }
  logarErro(exec.erroInterno, { rota: "acaoRapida", resumo: { acao } });
  return { ok: false, mensagem: "Não foi possível concluir. Tente de novo." };
}
