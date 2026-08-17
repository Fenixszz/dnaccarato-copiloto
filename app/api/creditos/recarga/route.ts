import { NextResponse } from "next/server";
import { z } from "zod";
import { comTratamentoDeErro } from "@/lib/webhooks/validation";
import { getServerSupabase } from "@/lib/supabase/server";
import { normalizarEmail } from "@/lib/auth/allowlist";
import { requireEnv } from "@/lib/env";
import { registrarRecarga } from "@/lib/creditos";
import { registrarAuditoria } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

// Payload validado com Zod (CLAUDE.md). Valor em REAIS; convertemos pra centavos.
const recargaSchema = z.object({
  valor_reais: z.number().positive().finite(),
  observacao: z.string().trim().max(500).optional(),
});

/**
 * POST /api/creditos/recarga
 *
 * Registra uma recarga de crédito (Pix que o João confirmou ter recebido):
 * grava em creditos_recargas e soma no saldo global. RESTRITO ao João — checa o
 * e-mail autenticado contra EMAIL_JOAO. A Adriana não recarrega, só visualiza.
 * Toda recarga é auditada (quem, valor, quando).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rota = "POST /api/creditos/recarga";

  return comTratamentoDeErro({ rota }, async () => {
    // --- Autenticação: precisa estar logado ---
    const supabase = getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user === null) {
      return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    }

    // --- Autorização: só o João registra recarga ---
    const emailJoao = normalizarEmail(requireEnv("EMAIL_JOAO"));
    if (normalizarEmail(user.email ?? "") !== emailJoao) {
      return NextResponse.json(
        { erro: "Apenas o João pode registrar recargas." },
        { status: 403 },
      );
    }

    // --- Validação do payload ---
    let corpo: unknown;
    try {
      corpo = await request.json();
    } catch {
      return NextResponse.json({ erro: "Corpo não é JSON válido." }, { status: 400 });
    }
    const parsed = recargaSchema.safeParse(corpo);
    if (!parsed.success) {
      return NextResponse.json(
        { erro: "Informe um valor em reais maior que zero." },
        { status: 400 },
      );
    }

    const valorCentavos = Math.round(parsed.data.valor_reais * 100);
    const registradaPor = normalizarEmail(user.email ?? "");

    const { saldoCentavos } = await registrarRecarga({
      valorCentavos,
      registradaPor,
      observacao: parsed.data.observacao ?? null,
    });

    await registrarAuditoria({
      origem: "dashboard",
      acao: "registrar_recarga",
      resultado: "sucesso",
      detalhes: { valor_centavos: valorCentavos, registrada_por: registradaPor },
    });

    return NextResponse.json({ ok: true, saldo_centavos: saldoCentavos });
  });
}
