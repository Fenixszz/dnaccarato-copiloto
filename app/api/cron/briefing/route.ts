import { NextResponse } from "next/server";
import { comTratamentoDeErro, logarErro } from "@/lib/webhooks/validation";
import { optionalEnv, requireEnv } from "@/lib/env";
import { getServiceClient } from "@/lib/db/client";
import { detectarFurosDeTodas } from "@/lib/matching/furos";
import {
  priorizarFuros,
  gerarTextoBriefing,
  type Compromisso,
} from "@/lib/briefing/priorizar";
import { compromissosDeHoje } from "@/lib/integrations/agenda";
import { enviarTexto } from "@/lib/whatsapp/client";
import { normalizarTelefone } from "@/lib/matching/matcher";
import type { Json } from "@/lib/db/types";

export const dynamic = "force-dynamic";

/** Hora atual (0–23) no fuso de São Paulo. */
function horaEmSaoPaulo(agora: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  });
  return Number.parseInt(fmt.format(agora), 10);
}

/**
 * Briefing diário — chamado pelo Cron da Vercel.
 *
 * O cron da Vercel dispara de hora em hora (vercel.json); esta rota só executa
 * o envio quando a hora em America/Sao_Paulo == BRIEFING_HORA (assim a Adriana
 * escolhe o horário via env, sem redeploy). Passe ?forcar=1 para disparar já.
 *
 * Protegida: exige Authorization: Bearer <CRON_SECRET> (a Vercel injeta esse
 * header automaticamente quando CRON_SECRET está definido).
 *
 * Fluxo: detecta furos de todas as alunas → prioriza → gera a mensagem (+ resumo
 * da agenda do dia) → envia no WhatsApp da Adriana (via rate limiter) → grava
 * em briefings_enviados.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rota = "GET /api/cron/briefing";

  return comTratamentoDeErro({ rota }, async () => {
    // Autorização do cron.
    if (request.headers.get("authorization") !== `Bearer ${requireEnv("CRON_SECRET")}`) {
      logarErro(new Error("Chamada ao cron sem autorização"), { rota });
      return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
    }

    // Só no horário escolhido (a menos que force manualmente).
    const horaAlvo = Number.parseInt(optionalEnv("BRIEFING_HORA", "8"), 10);
    const horaAgora = horaEmSaoPaulo();
    const forcar = new URL(request.url).searchParams.get("forcar") === "1";
    if (!forcar && horaAgora !== horaAlvo) {
      return NextResponse.json({
        status: "fora_do_horario",
        hora: horaAgora,
        alvo: horaAlvo,
      });
    }

    // 1. Furos de todas as alunas → prioriza (top 2-3).
    const entradas = await detectarFurosDeTodas();
    const prioritizados = priorizarFuros(entradas);

    // Agenda do dia (contexto extra — nunca deve quebrar o briefing).
    let compromissos: Compromisso[] = [];
    try {
      compromissos = await compromissosDeHoje();
    } catch (erro) {
      logarErro(erro, { rota, resumo: { etapa: "agenda" } });
    }

    // 2. Mensagem.
    const texto = gerarTextoBriefing(prioritizados, compromissos);

    // 3. Envia no WhatsApp da Adriana (enviarTexto passa pelo rate limiter).
    const destino = normalizarTelefone(requireEnv("BRIEFING_WHATSAPP"));
    const envio = await enviarTexto({ numero: destino, texto });

    // 4. Salva o histórico.
    const db = getServiceClient();
    const metadata: Record<string, Json> = {
      furos: prioritizados.length,
      compromissos: compromissos.length,
      evolution_status: envio.status,
    };
    const { error: eHist } = await db.from("briefings_enviados").insert({
      destino,
      canal: "whatsapp",
      conteudo: texto,
      status: envio.ok ? "enviado" : "falha",
      metadata,
    });
    if (eHist) throw new Error(`Falha ao salvar briefing: ${eHist.message}`);

    if (!envio.ok) {
      await db.from("falhas_sistema").insert({
        tipo: "whatsapp_envio",
        severidade: "alta",
        mensagem: `Briefing não enviado (Evolution HTTP ${envio.status}).`,
        contexto: { destino },
      });
      return NextResponse.json(
        { status: "falha_envio", http: envio.status },
        { status: 502 },
      );
    }

    return NextResponse.json({
      status: "enviado",
      furos: prioritizados.length,
      compromissos: compromissos.length,
    });
  });
}
