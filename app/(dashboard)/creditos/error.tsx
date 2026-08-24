"use client";

import { useEffect } from "react";
import { EstadoErro } from "../_components/estados";

/** Estado de erro da tela de créditos. */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("Falha ao carregar créditos:", error.message);
  }, [error]);

  return (
    <section className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-semibold text-marca-grafite">Créditos</h1>
      <div className="mt-6">
        <EstadoErro titulo="Não foi possível carregar o saldo." reset={reset} />
      </div>
    </section>
  );
}
