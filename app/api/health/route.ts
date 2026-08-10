import { NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/webhooks/validation";
import { getServiceClient } from "@/lib/db/client";
import { optionalEnv } from "@/lib/env";
import { horaEmSaoPaulo, inicioDeHojeSP } from "@/lib/tempo";

export const dynamic = "force-dynamic";

interface CheckBriefing {
  status: "ok" | "aguardando" | "nao_rodou" | "desconhecido";
  rodou?: boolean;
  limite?: number;
  erro?: string;
}

/**
 * Verifica se o briefing diário já rodou hoje. Se não rodou e já passou do
 * horário limite (BRIEFING_LIMITE_HORA, fuso SP), sinaliza "nao_rodou".
 */
async function checarBriefing(): Promise<CheckBriefing> {
  try {
    const db = getServiceClient();
    const { data, error } = await db
      .from("briefings_enviados")
      .select("enviado_em")
      .gte("enviado_em", inicioDeHojeSP())
      .limit(1);
    if (error) throw new Error(error.message);

    const rodou = (data ?? []).length > 0;
    const limite = Number.parseInt(optionalEnv("BRIEFING_LIMITE_HORA", "10"), 10);
    if (rodou) return { status: "ok", rodou: true };
    if (horaEmSaoPaulo() < limite) return { status: "aguardando", rodou: false, limite };
    return { status: "nao_rodou", rodou: false, limite };
  } catch (erro) {
    return {
      status: "desconhecido",
      erro: erro instanceof Error ? erro.message : String(erro),
    };
  }
}

/**
 * Health check. Além de confirmar que o processo responde, expõe se o briefing
 * diário rodou hoje (para monitoramento externo).
 */
export async function GET(): Promise<NextResponse> {
  return comTratamentoDeErro({ rota: "GET /api/health" }, async () => {
    const briefing = await checarBriefing();
    const status = briefing.status === "nao_rodou" ? "degradado" : "ok";
    return NextResponse.json({
      status,
      servico: "dnaccarato-copiloto",
      timestamp: new Date().toISOString(),
      checks: { briefing },
    });
  });
}
