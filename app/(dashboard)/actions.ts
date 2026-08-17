"use server";

import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/db/queries";

/** Server action de logout do dashboard: encerra a sessão, audita e volta ao login. */
export async function signout(): Promise<void> {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.auth.signOut();

  await registrarAuditoria({
    origem: "dashboard",
    acao: "logout",
    resultado: "sucesso",
    detalhes: user?.email ? { email: user.email } : {},
  });

  redirect("/login");
}
