import { createBrowserClient } from "@supabase/ssr";

// Client Supabase para componentes que rodam no browser (form de login,
// botão de sair). Usa só a chave pública (anon).
export function criarSupabaseNavegador() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY precisam estar definidas (veja .env.example)"
    );
  }
  return createBrowserClient(url, chave);
}
