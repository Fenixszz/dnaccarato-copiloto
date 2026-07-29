import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

/**
 * Cliente Supabase para uso EXCLUSIVO no servidor (service_role).
 * Ignora Row Level Security — nunca importar em código de client.
 *
 * Lazy singleton: só cria a conexão quando realmente usada, evitando
 * quebrar o build quando as variáveis ainda não estão configuradas.
 */
let serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (serviceClient === null) {
    serviceClient = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
  }
  return serviceClient;
}
