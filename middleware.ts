import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Roda em tudo, EXCETO:
     *  - /api      → webhooks/MCP/cron têm autenticação própria (token/secret)
     *  - /widget   → chat público white-label
     *  - assets do Next e arquivos estáticos com extensão
     * O que sobra é o dashboard (rota "/" e telas internas) + /login + /auth.
     */
    "/((?!api|widget|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
