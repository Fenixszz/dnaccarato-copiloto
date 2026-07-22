import { NextResponse } from "next/server";
import { z } from "zod";
import { montarDossie } from "@/lib/dossie";
import { registrarErroDeRota } from "@/lib/log";

const ROTA = "/api/alunas/[id]/dossie";

const parametrosSchema = z.object({ id: z.uuid() });

// Dossiê da aluna — a montagem (query única, sem N+1) vive em lib/dossie.ts,
// compartilhada com a tool MCP dossie_da_aluna.
// TODO fase de autenticação: proteger junto com o restante do dashboard.
export async function GET(_request: Request, ctx: RouteContext<"/api/alunas/[id]/dossie">) {
  const parametros = parametrosSchema.safeParse(await ctx.params);
  if (!parametros.success) {
    return NextResponse.json({ erro: "Id de aluna inválido (esperado UUID)" }, { status: 400 });
  }
  const alunaId = parametros.data.id;

  try {
    const dossie = await montarDossie(alunaId);
    if (dossie === null) {
      return NextResponse.json({ erro: "Aluna não encontrada" }, { status: 404 });
    }
    return NextResponse.json(dossie);
  } catch (erro) {
    registrarErroDeRota({ rota: ROTA, resumo: `aluna ${alunaId}` }, erro);
    return NextResponse.json({ erro: "Erro interno ao montar o dossiê" }, { status: 500 });
  }
}
