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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-12 text-slate-900">
      {/* Fundo decorativo: gradiente suave + brilhos difusos */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-indigo-50"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-violet-200/40 blur-3xl"
      />

      <div className="relative w-full max-w-sm">
        {/* Marca */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-semibold text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/40">
            CD
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">
            Copiloto Dnaccarato
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Acesso restrito. Entre com seu e-mail e senha.
          </p>
        </div>

        {/* Cartão */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-xl shadow-slate-900/5 backdrop-blur-sm sm:p-8">
          <LoginForm proximo={proximo} />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Uso interno do escritório Dnaccarato.
        </p>
      </div>
    </main>
  );
}
