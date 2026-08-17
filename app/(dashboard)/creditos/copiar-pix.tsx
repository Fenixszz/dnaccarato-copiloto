"use client";

import { useState } from "react";

/** Mostra a chave Pix do João e um botão pra Adriana copiar. Sem QR, sem API. */
export function CopiarPix({ chave }: { chave: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(chave);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Clipboard bloqueado: o valor continua visível pra copiar na mão.
      setCopiado(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded-md bg-slate-100 px-3 py-1.5 text-sm text-slate-800">
        {chave}
      </code>
      <button
        type="button"
        onClick={copiar}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        {copiado ? "Copiado! ✓" : "Copiar chave"}
      </button>
    </div>
  );
}
