"use client";

import { useEffect } from "react";
import { EstadoErro } from "../../_components/estados";

/** Estado de erro do dossiê da aluna. */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("Falha ao carregar o dossiê da aluna:", error.message);
  }, [error]);

  return (
    <section className="mx-auto max-w-4xl px-6 py-8">
      <EstadoErro titulo="Não foi possível carregar o dossiê." reset={reset} />
    </section>
  );
}
