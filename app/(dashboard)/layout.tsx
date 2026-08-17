import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { emailPermitido } from "@/lib/auth/allowlist";
import { signout } from "./actions";

/**
 * Layout base da área administrativa autenticada.
 *
 * Gate de autenticação (defesa em profundidade, além do middleware): valida a
 * sessão com `getUser()` e exige que o e-mail esteja na allowlist (Adriana/João).
 * Sem sessão autorizada → redireciona pro /login.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null || !emailPermitido(user.email)) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold">Copiloto Dnaccarato</span>
            <nav className="flex items-center gap-4 text-sm text-slate-600">
              <Link href="/" className="hover:text-slate-900">
                Início
              </Link>
              <Link href="/alunas" className="hover:text-slate-900">
                Alunas
              </Link>
              <Link href="/furos" className="hover:text-slate-900">
                Furos
              </Link>
              <Link href="/creditos" className="hover:text-slate-900">
                Créditos
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{user.email}</span>
            <form action={signout}>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
