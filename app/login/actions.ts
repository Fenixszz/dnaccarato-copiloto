"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { emailPermitido, normalizarEmail } from "@/lib/auth/allowlist";
import { registrarAuditoria } from "@/lib/db/queries";

/** Payload de entrada do login — validado com Zod antes de qualquer coisa. */
const loginSchema = z.object({
  email: z.string().trim().email(),
  senha: z.string().min(1),
  proximo: z.string().optional(),
});

export interface LoginState {
  erro: string | null;
}
// Obs.: um arquivo "use server" só pode exportar funções async. O estado
// inicial do useFormState é definido no client (login-form.tsx), não aqui.

// Mensagem genérica e única: não revela se o e-mail existe nem se está fora
// da allowlist (evita enumeração de contas).
const CREDENCIAL_INVALIDA = "E-mail ou senha inválidos.";

/**
 * Server action de login (email/senha) do dashboard. Cadastro é fechado:
 * só a allowlist (Adriana/João) entra. Valida entrada, autentica no Supabase,
 * audita e redireciona pro destino.
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
    proximo: formData.get("proximo"),
  });
  if (!parsed.success) {
    return { erro: CREDENCIAL_INVALIDA };
  }

  const email = normalizarEmail(parsed.data.email);

  // Barra e-mails fora da allowlist ANTES de tentar autenticar.
  if (!emailPermitido(email)) {
    await registrarAuditoria({
      origem: "dashboard",
      acao: "login",
      resultado: "erro",
      detalhes: { motivo: "email_nao_autorizado", email },
    });
    return { erro: CREDENCIAL_INVALIDA };
  }

  const supabase = getServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.senha,
  });

  if (error !== null) {
    await registrarAuditoria({
      origem: "dashboard",
      acao: "login",
      resultado: "erro",
      detalhes: { motivo: "credencial_invalida", email },
    });
    return { erro: CREDENCIAL_INVALIDA };
  }

  await registrarAuditoria({
    origem: "dashboard",
    acao: "login",
    resultado: "sucesso",
    detalhes: { email },
  });

  // Só redireciona para caminhos internos (evita open redirect via ?proximo=).
  const destino =
    parsed.data.proximo &&
    parsed.data.proximo.startsWith("/") &&
    !parsed.data.proximo.startsWith("//")
      ? parsed.data.proximo
      : "/";
  redirect(destino);
}
