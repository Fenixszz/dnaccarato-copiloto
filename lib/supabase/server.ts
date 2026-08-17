import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireEnv } from "@/lib/env";
import type { Database } from "@/lib/db/types";

/**
 * Cliente Supabase para o SERVIDOR do dashboard (RSC, route handlers e server
 * actions). Usa a chave ANON e RESPEITA Row Level Security, lendo/gravando a
 * sessão do usuário nos cookies via @supabase/ssr.
 *
 * Diferente de `getServiceClient()` (service_role, ignora RLS, para
 * webhooks/cron/MCP): este é o cliente do usuário autenticado — quem lê aqui é
 * a Adriana ou o João logados.
 */
export function getServerSupabase() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` foi chamado a partir de um Server Component, onde os
            // cookies são somente leitura. A sessão é renovada pelo middleware,
            // então é seguro ignorar aqui.
          }
        },
      },
    },
  );
}
