"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarSupabaseNavegador } from "@/lib/supabase/navegador";

export function BotaoSair() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    await criarSupabaseNavegador().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={sair}
      disabled={saindo}
      className="rounded border px-3 py-1 text-sm disabled:opacity-60"
    >
      {saindo ? "Saindo…" : "Sair"}
    </button>
  );
}
