"use client";

import { useEffect } from "react";
import { EstadoErro } from "../_components/estados";

/** Estado de erro da lista de alunas. */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("Falha ao carregar a lista de alunas:", error.message);
  }, [error]);

  return (
    <section className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Alunas</h1>
      <div className="mt-6">
        <EstadoErro titulo="Não foi possível carregar as alunas." reset={reset} />
      </div>
    </section>
  );
}
