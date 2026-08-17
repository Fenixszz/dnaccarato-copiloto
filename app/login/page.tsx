import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { emailPermitido } from "@/lib/auth/allowlist";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar — Copiloto Dnaccarato",
};

/** Tela de login. Fica FORA do grupo (dashboard) — sem o gate de auth. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: { proximo?: string };
}) {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Já logado e autorizado: não mostra o login de novo.
  if (user !== null && emailPermitido(user.email)) {
    redirect("/");
  }

  const proximo =
    searchParams.proximo && searchParams.proximo.startsWith("/")
      ? searchParams.proximo
      : undefined;

  return (
    <main>
      <h1>Copiloto Dnaccarato</h1>
      <p>Acesso restrito. Entre com seu e-mail e senha.</p>
      <LoginForm proximo={proximo} />
    </main>
  );
}
