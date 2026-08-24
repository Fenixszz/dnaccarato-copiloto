import type { Metadata } from "next";
import Image from "next/image";
import { Nunito_Sans } from "next/font/google";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { emailPermitido } from "@/lib/auth/allowlist";
import { LoginForm } from "./login-form";

// Nunito Sans é a fonte oficial do site da Adriana (drinaccarato.com.br).
const nunito = Nunito_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "900"],
  variable: "--fonte-marca",
  display: "swap",
  // Evita o warning "Failed to find font override values" do next/font com Nunito Sans.
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Entrar — Adriana Naccarato",
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
    <main
      className={`${nunito.variable} flex min-h-screen font-marca text-marca-grafite`}
    >
      {/* Painel de marca — só em telas médias+ (identidade da Adriana) */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-marca-caramelo to-marca-caramelo-escuro px-12 py-14 text-white lg:flex">
        {/* Textura sutil de brilho */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-marca-vinho/20 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <Image
            src="/marca/an-branca.png"
            alt="Monograma Adriana Naccarato"
            width={48}
            height={48}
            className="h-11 w-11 object-contain"
            priority
          />
          <span className="text-sm font-semibold uppercase tracking-[0.28em]">
            Adriana Naccarato
          </span>
        </div>

        <div className="relative max-w-md">
          <p className="font-light leading-snug text-white/80">Copiloto</p>
          <h2 className="mt-2 text-4xl font-light leading-tight">
            Você não precisa gritar
            <br />
            para ser <span className="font-semibold">ouvida.</span>
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/70">
            Posicione sua marca com estratégia e propósito. Este é o painel interno de
            operação do escritório.
          </p>
        </div>

        <p className="relative text-xs tracking-wide text-white/50">
          drinaccarato.com.br
        </p>
      </aside>

      {/* Painel do formulário */}
      <section className="flex w-full items-center justify-center bg-marca-creme px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          {/* Marca compacta (aparece no mobile, onde o painel some) */}
          <div className="mb-9 flex flex-col items-center text-center lg:items-start lg:text-left">
            <Image
              src="/marca/an-monograma.png"
              alt="Monograma Adriana Naccarato"
              width={64}
              height={64}
              className="h-14 w-14 object-contain lg:hidden"
              priority
            />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-marca-grafite lg:mt-0">
              Bem-vinda de volta
            </h1>
            <p className="mt-1.5 text-sm text-marca-texto">
              Acesso restrito. Entre com seu e-mail e senha.
            </p>
          </div>

          <LoginForm proximo={proximo} />

          <p className="mt-8 text-center text-xs text-marca-texto/80 lg:text-left">
            Uso interno do escritório Adriana Naccarato.
          </p>
        </div>
      </section>
    </main>
  );
}
