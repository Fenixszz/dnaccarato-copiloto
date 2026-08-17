import { NextResponse } from "next/server";
import { z } from "zod";
import { comTratamentoDeErro, logarErro } from "@/lib/webhooks/validation";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  responderComMcpHistorico,
  type MensagemChat,
} from "@/lib/integrations/anthropic";
import { ErroBillingAnthropic } from "@/lib/integrations/anthropic-billing";
import {
  carregarHistoricoChat,
  salvarMensagemChat,
  LIMITE_CONTEXTO,
} from "@/lib/chat/historico";

export const dynamic = "force-dynamic";

// Payload validado com Zod antes de qualquer coisa (CLAUDE.md).
const chatSchema = z.object({
  mensagem: z.string().trim().min(1).max(4000),
});

// Resposta amigável quando a IA falha (billing ou outra) — o chat não trava.
const FALLBACK =
  "Tive um probleminha pra responder agora. Pode tentar de novo daqui a pouco?";

/**
 * POST /api/widget/chat
 *
 * Chat do widget conectado à API da Anthropic NO BACKEND (a API key e o token
 * do MCP nunca vão pro client). Passa o histórico da conversa + o conector
 * mcp_servers (Fase 4). O histórico é associado ao USUÁRIO LOGADO (sessão do
 * Supabase); sem sessão → 401.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rota = "POST /api/widget/chat";

  return comTratamentoDeErro({ rota }, async () => {
    // --- Autenticação: histórico é do usuário logado ---
    const supabase = getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user === null) {
      return NextResponse.json({ erro: "Entre para conversar." }, { status: 401 });
    }

    // --- Validação ---
    let corpo: unknown;
    try {
      corpo = await request.json();
    } catch {
      return NextResponse.json({ erro: "Corpo não é JSON válido." }, { status: 400 });
    }
    const parsed = chatSchema.safeParse(corpo);
    if (!parsed.success) {
      return NextResponse.json(
        { erro: "Mensagem inválida (vazia ou longa demais)." },
        { status: 400 },
      );
    }
    const mensagem = parsed.data.mensagem;

    // Histórico anterior (contexto) + a nova mensagem do usuário.
    const anteriores = await carregarHistoricoChat(user.id, LIMITE_CONTEXTO);
    await salvarMensagemChat(user.id, "usuario", mensagem);

    const paraModelo: MensagemChat[] = [
      ...anteriores,
      { autor: "usuario", texto: mensagem },
    ];

    // Chama a Anthropic (com MCP) no servidor. Falha não trava o chat: devolve
    // um fallback e NÃO persiste resposta (pra a pessoa poder tentar de novo).
    let resposta: string;
    try {
      resposta = await responderComMcpHistorico(paraModelo);
    } catch (erro) {
      // ErroBillingAnthropic já logou alta + avisou o João lá dentro; as demais
      // registramos aqui. Em ambos os casos, a pessoa recebe o fallback.
      if (!(erro instanceof ErroBillingAnthropic)) {
        logarErro(erro, { rota, resumo: { etapa: "anthropic" } });
      }
      return NextResponse.json({ resposta: FALLBACK, fallback: true });
    }

    await salvarMensagemChat(user.id, "assistente", resposta);
    return NextResponse.json({ resposta });
  });
}
