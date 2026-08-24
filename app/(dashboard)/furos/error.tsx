"use client";

import { useEffect } from "react";
import { EstadoErro } from "../_components/estados";

/** Estado de erro da tela de furos. */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("Falha ao carregar os furos:", error.message);
  }, [error]);

  return (
    <section className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-xl font-semibold text-marca-grafite">Furos</h1>
      <div className="mt-6">
        <EstadoErro titulo="Não foi possível carregar os furos." reset={reset} />
      </div>
    </section>
  );
}
