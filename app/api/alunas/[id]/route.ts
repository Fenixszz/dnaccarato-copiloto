import { NextResponse } from "next/server";
import { z } from "zod";
import { comTratamentoDeErro } from "@/lib/webhooks/validation";
import { getServerSupabase } from "@/lib/supabase/server";
import { emailPermitido, normalizarEmail } from "@/lib/auth/allowlist";
import { getServiceClient } from "@/lib/db/client";
import { registrarAuditoria } from "@/lib/db/queries";
import { editarAlunaSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/alunas/[id] — edita nome, e-mail e telefone de uma aluna.
 *
 * Restrito à allowlist do dashboard (Adriana/João). Payload validado com Zod
 * (e-mail e telefone opcionais → null quando vazios). Toda edição é auditada
 * (quem editou, quais campos). E-mail duplicado (unique) vira 409 com mensagem
 * clara. Aluna inexistente ou já anonimizada → 404.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const rota = `PATCH /api/alunas/${params.id}`;

  return comTratamentoDeErro({ rota }, async () => {
    // --- Autenticação + autorização (allowlist do dashboard) ---
    const supabase = getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user === null) {
      return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    }
    if (!emailPermitido(user.email)) {
      return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
    }

    // --- id da aluna ---
    const idValido = z.string().uuid().safeParse(params.id);
    if (!idValido.success) {
      return NextResponse.json({ erro: "id de aluna inválido." }, { status: 400 });
    }
    const alunaId = idValido.data;

    // --- Payload ---
    let corpo: unknown;
    try {
      corpo = await request.json();
    } catch {
      return NextResponse.json({ erro: "Corpo não é JSON válido." }, { status: 400 });
    }
    const parsed = editarAlunaSchema.safeParse(corpo);
    if (!parsed.success) {
      return NextResponse.json(
        { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 },
      );
    }
    const { nome, email, telefone } = parsed.data;

    // --- Atualiza (não mexe em aluna anonimizada) ---
    const db = getServiceClient();
    const { data, error } = await db
      .from("alunas")
      .update({ nome, email, telefone })
      .eq("id", alunaId)
      .is("anonimizada_em", null)
      .select("id, nome, email, telefone")
      .maybeSingle();

    if (error !== null) {
      // E-mail já usado por outra aluna (unique constraint).
      if (error.code === "23505") {
        return NextResponse.json(
          { erro: "Esse e-mail já está cadastrado em outra aluna." },
          { status: 409 },
        );
      }
      await registrarAuditoria({
        origem: "dashboard",
        acao: "editar_aluna",
        alunaId,
        resultado: "erro",
        detalhes: { editado_por: normalizarEmail(user.email ?? "") },
      });
      throw new Error(`Falha ao editar aluna: ${error.message}`);
    }

    if (data === null) {
      return NextResponse.json({ erro: "Aluna não encontrada." }, { status: 404 });
    }

    await registrarAuditoria({
      origem: "dashboard",
      acao: "editar_aluna",
      alunaId,
      resultado: "sucesso",
      detalhes: {
        editado_por: normalizarEmail(user.email ?? ""),
        // registra QUAIS campos foram enviados (sem os valores em texto livre).
        campos: ["nome", "email", "telefone"],
      },
    });

    return NextResponse.json({ ok: true, aluna: data });
  });
}
