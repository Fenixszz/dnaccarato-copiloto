"use server";

import { z } from "zod";
import { acaoCriarTaskAsana, acaoEnviarLembretePagamento } from "@/lib/acoes/escrita";
import { executarComAuditoria, type DesfechoAcao } from "@/lib/acoes/executar";
import { emailPermitido } from "@/lib/auth/emails-permitidos";
import { criarSupabaseServidor } from "@/lib/supabase/servidor";

// Ações rápidas da tela de furos. Reusam o mesmo núcleo das tools MCP de
// escrita (Fase 4.3), mas auditadas como origem 'dashboard' com o email do
// usuário logado. Server Actions são invocáveis por fora do proxy, então
// cada uma reautentica e valida o input.

export type ResultadoAcaoRapida = { ok: boolean; mensagem: string };

const alunaIdSchema = z.uuid();

async function usuarioAtorAutorizado(): Promise<string> {
  const supabase = await criarSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !emailPermitido(user.email)) {
    throw new Error("Sem sessão autorizada");
  }
  return user.email;
}

function traduzir(desfecho: DesfechoAcao): ResultadoAcaoRapida {
  switch (desfecho.status) {
    case "ok":
      return { ok: true, mensagem: desfecho.mensagem };
    case "recusado":
      return { ok: false, mensagem: desfecho.mensagem };
    case "erro":
      return {
        ok: false,
        mensagem: "Não foi possível concluir a ação. Tente de novo em instantes.",
      };
    case "sem_auditoria":
      return {
        ok: false,
        mensagem:
          "A ação pode ter sido executada mas não foi auditada — verifique antes de repetir.",
      };
  }
}

export async function enviarLembrete(alunaId: string): Promise<ResultadoAcaoRapida> {
  if (!alunaIdSchema.safeParse(alunaId).success) {
    return { ok: false, mensagem: "Aluna inválida." };
  }
  const usuario = await usuarioAtorAutorizado();
  const desfecho = await executarComAuditoria(
    { origem: "dashboard", usuario },
    "enviar_lembrete_pagamento",
    alunaId,
    () => acaoEnviarLembretePagamento(alunaId)
  );
  return traduzir(desfecho);
}

const criarTaskSchema = z.object({
  alunaId: z.uuid(),
  titulo: z.string().min(3).max(200),
});

export async function criarTask(alunaId: string, titulo: string): Promise<ResultadoAcaoRapida> {
  const dados = criarTaskSchema.safeParse({ alunaId, titulo });
  if (!dados.success) {
    return { ok: false, mensagem: "Dados inválidos para criar a task." };
  }
  const usuario = await usuarioAtorAutorizado();
  const desfecho = await executarComAuditoria(
    { origem: "dashboard", usuario },
    "criar_task_asana",
    dados.data.alunaId,
    () =>
      acaoCriarTaskAsana(
        dados.data.alunaId,
        dados.data.titulo,
        "Criada pelo dashboard a partir de um furo detectado."
      )
  );
  return traduzir(desfecho);
}
