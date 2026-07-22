import { NextResponse } from "next/server";
import { executarBriefingDiario } from "@/lib/briefing/enviar";
import { registrarErroDeRota } from "@/lib/log";
import { tokenValido } from "@/lib/webhooks/autenticacao";

const ROTA = "/api/cron/briefing";

// Disparo do briefing diário. Chamada pelo cron da Vercel (vercel.json), que
// manda "Authorization: Bearer <CRON_SECRET>" automaticamente quando a env
// CRON_SECRET existe no projeto — rota não é pública.
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    registrarErroDeRota(
      { rota: ROTA },
      new Error("CRON_SECRET não configurado (veja .env.example)")
    );
    return NextResponse.json({ erro: "Rota de cron não configurada" }, { status: 500 });
  }
  if (!tokenValido(request.headers.get("authorization"), `Bearer ${segredo}`)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  try {
    const resultado = await executarBriefingDiario();
    return NextResponse.json(resultado);
  } catch (erro) {
    registrarErroDeRota({ rota: ROTA }, erro);
    // 500 deixa a falha visível no painel de crons da Vercel.
    return NextResponse.json({ erro: "Erro interno ao executar o briefing" }, { status: 500 });
  }
}
