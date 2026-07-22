import { NextResponse } from "next/server";
import { z } from "zod";
import { obterSupabase } from "@/lib/db/supabase";
import { situacaoDePagamentos } from "@/lib/dossie";
import { registrarErroDeRota } from "@/lib/log";

const ROTA = "/api/alunas/[id]/dossie";

const parametrosSchema = z.object({ id: z.uuid() });

// Dossiê da aluna: agregado completo numa única query (embeds do PostgREST
// sobre as FKs aluna_id — um round-trip só, sem N+1).
// TODO fase de autenticação: proteger junto com o restante do dashboard.
export async function GET(_request: Request, ctx: RouteContext<"/api/alunas/[id]/dossie">) {
  const parametros = parametrosSchema.safeParse(await ctx.params);
  if (!parametros.success) {
    return NextResponse.json({ erro: "Id de aluna inválido (esperado UUID)" }, { status: 400 });
  }
  const alunaId = parametros.data.id;

  try {
    const agora = new Date();
    const { data, error } = await obterSupabase()
      .from("alunas")
      .select(
        `id, nome, email, telefone, criado_em,
         pagamentos ( id, status, valor, vencimento, pago_em ),
         documentos ( id, tipo, status, assinado_em, link_drive ),
         formularios ( id, formulario_nome, respostas, respondido_em ),
         reunioes ( id, origem, data_hora, status, link ),
         tasks_asana ( id, task_id, titulo, status, criado_em )`
      )
      .eq("id", alunaId)
      // Reuniões: só a próxima (futura e não cancelada).
      .gte("reunioes.data_hora", agora.toISOString())
      .neq("reunioes.status", "cancelada")
      .order("data_hora", { referencedTable: "reunioes", ascending: true })
      .limit(1, { referencedTable: "reunioes" })
      // Pagamentos: os mais recentes bastam pro resumo e pro histórico.
      .order("vencimento", { referencedTable: "pagamentos", ascending: false })
      .limit(24, { referencedTable: "pagamentos" })
      // Formulários: últimas respostas.
      .order("respondido_em", { referencedTable: "formularios", ascending: false })
      .limit(5, { referencedTable: "formularios" })
      // Tasks: só as abertas.
      .is("tasks_asana.concluido_em", null)
      .maybeSingle();

    if (error) {
      throw new Error(`Falha ao montar dossiê: ${error.message}`);
    }
    if (data === null) {
      return NextResponse.json({ erro: "Aluna não encontrada" }, { status: 404 });
    }

    // Relacionamentos podem não existir ainda (aluna recém-criada por um
    // webhook): tudo abaixo degrada pra listas vazias / null, nunca erro.
    const pagamentos = data.pagamentos ?? [];
    const documentos = data.documentos ?? [];

    return NextResponse.json({
      aluna: {
        id: data.id,
        nome: data.nome,
        email: data.email,
        telefone: data.telefone,
        criado_em: data.criado_em,
      },
      pagamentos: {
        ...situacaoDePagamentos(pagamentos, agora),
        recentes: pagamentos,
      },
      documentos: {
        assinados: documentos.filter((documento) => documento.status === "assinado"),
        pendentes: documentos.filter((documento) => documento.status === "pendente"),
      },
      formularios: data.formularios ?? [],
      proxima_reuniao: (data.reunioes ?? [])[0] ?? null,
      tasks_abertas: data.tasks_asana ?? [],
    });
  } catch (erro) {
    registrarErroDeRota({ rota: ROTA, resumo: `aluna ${alunaId}` }, erro);
    return NextResponse.json({ erro: "Erro interno ao montar o dossiê" }, { status: 500 });
  }
}
