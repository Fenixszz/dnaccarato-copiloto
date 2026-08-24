"use client";

import { useEffect } from "react";
import { EstadoErro } from "./_components/estados";

/** Estado de erro da home: captura falhas ao carregar os dados e oferece retry. */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Sem PII: só a mensagem, para diagnóstico no console do navegador.
    console.error("Falha ao renderizar a home do dashboard:", error.message);
  }, [error]);

  return (
    <section className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-semibold text-marca-grafite">Painel do Copiloto</h1>
      <div className="mt-6">
        <EstadoErro titulo="Não foi possível carregar os totais." reset={reset} />
      </div>
    </section>
  );
}
