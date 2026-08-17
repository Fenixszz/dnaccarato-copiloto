import type { Metadata } from "next";
import { getServerSupabase } from "@/lib/supabase/server";
import { carregarHistoricoChat } from "@/lib/chat/historico";
import { logarErro } from "@/lib/webhooks/validation";
import type { MensagemChat } from "@/lib/integrations/anthropic";
import { ChatWidget } from "./chat-widget";

export const metadata: Metadata = { title: "Atendimento" };

// Dado sempre fresco: carrega o histórico do usuário logado a cada acesso.
export const dynamic = "force-dynamic";

export default async function WidgetPage() {
  // O histórico é do usuário LOGADO (sessão do Supabase). Sem sessão, o chat
  // pede login (a rota /api/widget/chat também exige auth).
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Carregar o histórico não pode derrubar a casca do chat (ex.: tabela ainda
  // não migrada, ou falha transitória) — degrada pra histórico vazio.
  let historico: MensagemChat[] = [];
  if (user) {
    try {
      historico = await carregarHistoricoChat(user.id);
    } catch (erro) {
      logarErro(erro, { rota: "GET /widget", resumo: { etapa: "historico" } });
    }
  }

  return <ChatWidget autenticado={user !== null} historicoInicial={historico} />;
}
