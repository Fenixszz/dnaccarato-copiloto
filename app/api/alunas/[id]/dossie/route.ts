import { NextResponse } from "next/server";
import { z } from "zod";
import { comTratamentoDeErro } from "@/lib/webhooks/validation";
import { carregarDossie } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

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

    const dossie = await carregarDossie(idValido.data);
    if (dossie === null) {
      return NextResponse.json({ erro: "Aluna não encontrada." }, { status: 404 });
    }

    return NextResponse.json(dossie);
  });
}
