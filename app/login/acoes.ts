"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { emailPermitido } from "@/lib/auth/emails-permitidos";
import { criarSupabaseServidor } from "@/lib/supabase/servidor";

const credenciaisSchema = z.object({
  email: z.email(),
  senha: z.string().min(1),
});

export type EstadoLogin = { erro: string | null };

export async function entrar(_estado: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const credenciais = credenciaisSchema.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
  if (!credenciais.success) {
    return { erro: "Informe um email e uma senha válidos." };
  }

  const supabase = await criarSupabaseServidor();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: credenciais.data.email,
    password: credenciais.data.senha,
  });
  if (error) {
    // Mensagem genérica de propósito — não revela se o email existe.
    return { erro: "Email ou senha incorretos." };
  }

  // Gate de autorização: mesmo com login válido, só a allowlist entra.
  if (!emailPermitido(data.user?.email)) {
    await supabase.auth.signOut();
    return { erro: "Este email não tem acesso ao painel." };
  }

  redirect("/");
}
