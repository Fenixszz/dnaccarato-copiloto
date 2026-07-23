import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client Supabase para Server Components, Server Actions e Route Handlers.
// Usa a chave pública (anon) + o JWT do usuário nos cookies, respeitando RLS.
export async function criarSupabaseServidor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY precisam estar definidas (veja .env.example)"
    );
  }

  const cookieStore = await cookies();
  return createServerClient(url, chave, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesParaSetar) => {
        try {
          for (const { name, value, options } of cookiesParaSetar) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Chamado de um Server Component (não pode setar cookie no render).
          // O proxy.ts já cuida de renovar a sessão a cada request.
        }
      },
    },
  });
}
