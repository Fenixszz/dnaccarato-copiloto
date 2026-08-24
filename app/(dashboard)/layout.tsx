import Image from "next/image";
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
    <div className="min-h-screen bg-marca-creme text-marca-grafite">
      <header className="border-b border-marca-nevoa bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/marca/an-monograma.png"
                alt="Adriana Naccarato"
                width={32}
                height={32}
                className="h-7 w-7 object-contain"
                priority
              />
              <span className="text-sm font-semibold tracking-tight">
                Copiloto Naccarato
              </span>
            </Link>
            <nav className="flex items-center gap-5 text-sm text-marca-texto">
              <Link href="/" className="transition-colors hover:text-marca-caramelo">
                Início
              </Link>
              <Link
                href="/alunas"
                className="transition-colors hover:text-marca-caramelo"
              >
                Alunas
              </Link>
              <Link href="/furos" className="transition-colors hover:text-marca-caramelo">
                Furos
              </Link>
              <Link
                href="/creditos"
                className="transition-colors hover:text-marca-caramelo"
              >
                Créditos
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-marca-texto">{user.email}</span>
            <form action={signout}>
              <button
                type="submit"
                className="rounded-lg border border-marca-areia px-3 py-1.5 text-sm font-medium text-marca-grafite transition-colors hover:bg-marca-nevoa"
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
