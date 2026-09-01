"use client";

import { useEffect } from "react";
import { EstadoErro } from "../_components/estados";

/** Estado de erro da tela de tarefas. */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("Falha ao carregar as tarefas:", error.message);
  }, [error]);

  return (
    <section className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-xl font-semibold text-marca-grafite">Tarefas</h1>
      <div className="mt-6">
        <EstadoErro titulo="Não foi possível carregar as tarefas." reset={reset} />
      </div>
    </section>
  );
}
