import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

let cliente: SupabaseClient<Database> | null = null;

// Client de servidor (service role). Nunca importar em código que roda no
// browser — a service role key ignora Row Level Security.
export function obterSupabase(): SupabaseClient<Database> {
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
  cliente = createClient<Database>(url, chave);
  return cliente;
}
