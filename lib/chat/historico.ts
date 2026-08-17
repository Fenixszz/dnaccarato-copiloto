/**
 * Histórico do chat do widget, por usuário autenticado. Acesso via service_role
 * no servidor, SEMPRE filtrando por usuario_id (o gate de auth fica na rota).
 */
import { getServiceClient } from "@/lib/db/client";
import type { MensagemChat } from "@/lib/integrations/anthropic";

/** Quantas mensagens de contexto mandar pra Anthropic (limita custo/tokens). */
export const LIMITE_CONTEXTO = 20;

/**
 * Carrega o histórico do usuário em ordem cronológica (mais antigo → mais
 * recente). `limite` corta pelas N mais recentes (mantendo a ordem).
 */
export async function carregarHistoricoChat(
  usuarioId: string,
  limite = 100,
): Promise<MensagemChat[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("chat_mensagens")
    .select("autor, texto, criado_em")
    .eq("usuario_id", usuarioId)
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Falha ao carregar histórico do chat: ${error.message}`);

  return (data ?? [])
    .reverse() // volta pra ordem cronológica
    .map((m) => ({
      autor: m.autor === "usuario" ? "usuario" : "assistente",
      texto: m.texto,
    }));
}

/** Grava uma mensagem no histórico do usuário. */
export async function salvarMensagemChat(
  usuarioId: string,
  autor: "usuario" | "assistente",
  texto: string,
): Promise<void> {
  const db = getServiceClient();
  const { error } = await db
    .from("chat_mensagens")
    .insert({ usuario_id: usuarioId, autor, texto });
  if (error) throw new Error(`Falha ao salvar mensagem do chat: ${error.message}`);
}
