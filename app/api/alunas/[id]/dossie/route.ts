import { NextResponse } from "next/server";
import { z } from "zod";
import { comTratamentoDeErro } from "@/lib/webhooks/validation";
import { getServiceClient } from "@/lib/db/client";
import { montarDossie, type DossieRow } from "@/lib/dossie";

export const dynamic = "force-dynamic";

// Uma única query com as relações embutidas (PostgREST resolve tudo num request
// só — sem N+1). Colunas explícitas para não trafegar dados desnecessários.
const SELECT_DOSSIE = `
  id, nome, email, telefone, criado_em, metadata,
  pagamentos ( id, origem, status, valor, vencimento, pago_em, referencia_externa ),
  documentos ( id, tipo, status, origem, assinado_em, motivo_rejeicao, link_assinado ),
  materiais ( id, nome_arquivo, tipo, link_drive, adicionado_em ),
  formularios ( id, formulario_nome, respostas, respondido_em ),
  reunioes ( id, origem, data_hora, status, link ),
  tasks_asana ( id, task_id, titulo, status, criado_em, concluido_em )
`;

/**
 * GET /api/alunas/[id]/dossie
 *
 * Agrega numa resposta só: cadastro, resumo de pagamento, documentos por status,
 * materiais recentes, últimas respostas de formulário, próxima reunião e tasks
 * abertas no Asana. Uma query só (sem N+1); relações ausentes viram vazio/null.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const rota = `GET /api/alunas/${params.id}/dossie`;

  return comTratamentoDeErro({ rota }, async () => {
    const idValido = z.string().uuid().safeParse(params.id);
    if (!idValido.success) {
      return NextResponse.json({ erro: "id de aluna inválido." }, { status: 400 });
    }

    const db = getServiceClient();
    const { data, error } = await db
      .from("alunas")
      .select(SELECT_DOSSIE)
      .eq("id", idValido.data)
      .maybeSingle();

    if (error) throw new Error(`Falha ao carregar dossiê: ${error.message}`);
    if (!data) {
      return NextResponse.json({ erro: "Aluna não encontrada." }, { status: 404 });
    }

    return NextResponse.json(montarDossie(data as unknown as DossieRow));
  });
}
