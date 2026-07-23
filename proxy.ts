import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { emailPermitido } from "@/lib/auth/emails-permitidos";

// Proxy (o antigo "middleware" do Next < 16): renova a sessão do Supabase a
// cada request e protege o dashboard. Rotas públicas: /login e o widget. As
// rotas /api ficam de fora pelo matcher (têm autenticação própria).

const ROTAS_PUBLICAS = ["/login", "/widget"];

function ehPublica(path: string): boolean {
  return ROTAS_PUBLICAS.some((rota) => path === rota || path.startsWith(`${rota}/`));
}

export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) {
    return resposta;
  }

  const supabase = createServerClient(url, chave, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesParaSetar) => {
        for (const { name, value } of cookiesParaSetar) {
          request.cookies.set(name, value);
        }
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of cookiesParaSetar) {
          resposta.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() valida o JWT com o Supabase (não confia só no cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const autorizado = emailPermitido(user?.email);
  const path = request.nextUrl.pathname;

  // Já autenticado e autorizado abrindo o login → vai direto pro painel.
  if (path === "/login" && autorizado) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  // Rota protegida sem autorização → tela de login.
  if (!ehPublica(path) && !autorizado) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return resposta;
}

export const config = {
  // Roda em tudo, menos /api, assets do Next e arquivos estáticos.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
