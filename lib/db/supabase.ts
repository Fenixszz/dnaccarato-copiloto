import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

// Client de servidor (service role). Nunca importar em código que roda no
// browser — a service role key ignora Row Level Security.
export function obterSupabase(): SupabaseClient {
  if (cliente) {
    return cliente;
  }
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar definidas (veja .env.example)"
    );
  }
  cliente = createClient(url, chave);
  return cliente;
}
