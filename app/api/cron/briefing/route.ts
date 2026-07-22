import { NextResponse } from "next/server";
import { registrarErroDeRota } from "@/lib/log";

// Disparo do briefing diário (chamado por um agendador externo, ex.: Vercel
// Cron). Protegido por CRON_SECRET pra ninguém disparar o briefing por fora.
export async function GET(request: Request) {
  try {
    const segredo = process.env.CRON_SECRET;
    if (!segredo) {
      registrarErroDeRota(
        { rota: "/api/cron/briefing" },
        new Error("CRON_SECRET não configurado (veja .env.example)")
      );
      return NextResponse.json({ erro: "Rota de cron não configurada" }, { status: 500 });
    }
    if (request.headers.get("authorization") !== `Bearer ${segredo}`) {
      return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
    }

    return NextResponse.json({ erro: "Briefing diário ainda não implementado" }, { status: 501 });
  } catch (erro) {
    registrarErroDeRota({ rota: "/api/cron/briefing" }, erro);
    return NextResponse.json({ erro: "Erro interno ao disparar o briefing" }, { status: 500 });
  }
}
