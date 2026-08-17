import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requireEnv } from "@/lib/env";
import { emailPermitido } from "@/lib/auth/allowlist";
import type { Database } from "@/lib/db/types";

/**
 * Prefixos públicos que NÃO exigem sessão. O widget e as rotas de API ficam
 * fora do matcher do middleware (ver `middleware.ts`), então aqui só listamos
 * as telas de autenticação servidas dentro do próprio app.
 */
const ROTAS_PUBLICAS = ["/login", "/auth"] as const;

function ehRotaPublica(pathname: string): boolean {
  return ROTAS_PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Renova a sessão do Supabase nos cookies e protege o dashboard.
 *
 * - Usa `getUser()` (revalida o token no servidor do Supabase) em vez de
 *   `getSession()` (que só lê o cookie, sem validar).
 * - Só a allowlist (Adriana/João) é considerada autorizada.
 * - Sem sessão autorizada numa rota protegida → redireciona pro /login,
 *   preservando o destino em `?proximo=` para voltar depois do login.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const autorizado = user !== null && emailPermitido(user.email);

  // Já logado e autorizado: não faz sentido ficar na tela de login.
  if (autorizado && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Rota protegida sem sessão autorizada → login.
  if (!ehRotaPublica(pathname) && !autorizado) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("proximo", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
