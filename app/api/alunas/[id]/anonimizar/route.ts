import { NextResponse } from "next/server";
import { z } from "zod";
import { comTratamentoDeErro } from "@/lib/webhooks/validation";
import { getServerSupabase } from "@/lib/supabase/server";
import { normalizarEmail } from "@/lib/auth/allowlist";
import { requireEnv } from "@/lib/env";
import { registrarAuditoria } from "@/lib/db/queries";
import { anonimizarAluna, AlunaNaoEncontrada } from "@/lib/lgpd/anonimizar";

export const dynamic = "force-dynamic";

// Payload validado com Zod (CLAUDE.md). Ação destrutível → exige confirmação
// explícita; `motivo` (opcional) fica no rastro de auditoria.
const anonimizarSchema = z.object({
  confirmar: z.literal(true, {
    errorMap: () => ({ message: "Envie confirmar: true para excluir os dados." }),
  }),
  motivo: z.string().trim().max(500).optional(),
});

/**
 * POST /api/alunas/[id]/anonimizar
 *
 * Atende ao direito de eliminação da titular (LGPD): a pedido da aluna, a
 * Adriana solicita a exclusão completa dos dados. Remove/anonimiza a aluna em
 * TODAS as tabelas relacionadas (ver lib/lgpd/anonimizar e RETENCAO.md).
 *
 * RESTRITO à Adriana — checa o e-mail autenticado contra EMAIL_ADRIANA (ela é
 * quem opera o negócio e recebe o pedido da titular). Idempotente (aluna já
 * anonimizada → no-op). Toda operação é auditada (quem, sobre quem, resultado).
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const rota = `POST /api/alunas/${params.id}/anonimizar`;

  return comTratamentoDeErro({ rota }, async () => {
    // --- Autenticação: precisa estar logado ---
    const supabase = getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user === null) {
      return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    }

    // --- Autorização: só a Adriana solicita exclusão de dados ---
    const emailAdriana = normalizarEmail(requireEnv("EMAIL_ADRIANA"));
    const solicitadoPor = normalizarEmail(user.email ?? "");
    if (solicitadoPor !== emailAdriana) {
      return NextResponse.json(
        { erro: "Apenas a Adriana pode solicitar a exclusão de dados." },
        { status: 403 },
      );
    }

    // --- Validação do id da aluna ---
    const idValido = z.string().uuid().safeParse(params.id);
    if (!idValido.success) {
      return NextResponse.json({ erro: "id de aluna inválido." }, { status: 400 });
    }

    // --- Validação do payload (confirmação obrigatória) ---
    let corpo: unknown;
    try {
      corpo = await request.json();
    } catch {
      return NextResponse.json({ erro: "Corpo não é JSON válido." }, { status: 400 });
    }
    const parsed = anonimizarSchema.safeParse(corpo);
    if (!parsed.success) {
      return NextResponse.json(
        { erro: parsed.error.issues[0]?.message ?? "Payload inválido." },
        { status: 400 },
      );
    }

    // --- Executa a anonimização, auditando sucesso/erro ---
    const alunaId = idValido.data;
    try {
      const resultado = await anonimizarAluna(alunaId);

      await registrarAuditoria({
        origem: "dashboard",
        acao: "anonimizar_aluna",
        alunaId,
        resultado: "sucesso",
        detalhes: {
          solicitado_por: solicitadoPor,
          motivo: parsed.data.motivo ?? null,
          ja_anonimizada: resultado.jaAnonimizada,
          removidos: resultado.removidos,
          documentos_limpos: resultado.documentosLimpos,
        },
      });

      return NextResponse.json({ ok: true, ...resultado });
    } catch (erro) {
      // Não encontrada é erro de negócio (404), não falha do sistema.
      if (erro instanceof AlunaNaoEncontrada) {
        return NextResponse.json({ erro: "Aluna não encontrada." }, { status: 404 });
      }

      await registrarAuditoria({
        origem: "dashboard",
        acao: "anonimizar_aluna",
        alunaId,
        resultado: "erro",
        detalhes: { solicitado_por: solicitadoPor, motivo: parsed.data.motivo ?? null },
      });
      throw erro; // comTratamentoDeErro loga e devolve 500
    }
  });
}
