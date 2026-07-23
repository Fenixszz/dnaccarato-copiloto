import { NextResponse } from "next/server";
import { obterSupabase } from "@/lib/db/supabase";
import { avaliarSaudeBriefing, type StatusBriefing } from "@/lib/health";
import { registrarErroDeRota } from "@/lib/log";

const ROTA = "/api/health";

// Health check com monitoramento do briefing diário: se o cron não rodou até
// o horário limite, o campo briefing fica "atrasado" e a resposta vira 503,
// pra um monitor externo (UptimeRobot etc.) conseguir alertar.
export async function GET() {
  const agora = new Date();
  const hoje = agora.toISOString().slice(0, 10);
  let statusBriefing: StatusBriefing;

  try {
    const { data, error } = await obterSupabase()
      .from("briefings_enviados")
      .select("id")
      .eq("chave_alerta", `briefing_diario:${hoje}`)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    statusBriefing = avaliarSaudeBriefing(data !== null, agora);
  } catch (erro) {
    // Não deu pra checar o banco: reporta como desconhecido/degradado em vez
    // de deixar o health check estourar.
    registrarErroDeRota({ rota: ROTA }, erro);
    statusBriefing = "desconhecido";
  }

  const degradado = statusBriefing === "atrasado" || statusBriefing === "desconhecido";
  return NextResponse.json(
    {
      status: degradado ? "degradado" : "ok",
      timestamp: agora.toISOString(),
      briefing: { status: statusBriefing, dia: hoje },
    },
    { status: degradado ? 503 : 200 }
  );
}
