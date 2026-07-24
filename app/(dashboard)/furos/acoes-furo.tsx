"use client";

import { useState, useTransition } from "react";
import { criarTask, enviarLembrete, type ResultadoAcaoRapida } from "./acoes";

export function AcoesFuro({
  alunaId,
  tipo,
  detalhe,
}: {
  alunaId: string;
  tipo: string;
  detalhe: string;
}) {
  const [pendente, iniciar] = useTransition();
  const [feedback, setFeedback] = useState<ResultadoAcaoRapida | null>(null);

  function rodar(acao: () => Promise<ResultadoAcaoRapida>) {
    setFeedback(null);
    iniciar(async () => {
      setFeedback(await acao());
    });
  }

  // Lembrete de pagamento só faz sentido no furo de atraso; criar task cabe
  // em qualquer furo.
  const podeMandarLembrete = tipo === "pagamento_atrasado";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {podeMandarLembrete && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => rodar(() => enviarLembrete(alunaId))}
            className="rounded border px-2 py-1 text-xs disabled:opacity-60"
          >
            Mandar lembrete
          </button>
        )}
        <button
          type="button"
          disabled={pendente}
          onClick={() => rodar(() => criarTask(alunaId, `Resolver: ${detalhe}`))}
          className="rounded border px-2 py-1 text-xs disabled:opacity-60"
        >
          Criar task
        </button>
      </div>
      {pendente && <span className="text-xs text-neutral-400">Executando…</span>}
      {feedback && (
        <span
          role="status"
          className={`text-xs ${feedback.ok ? "text-green-700" : "text-red-600"}`}
        >
          {feedback.mensagem}
        </span>
      )}
    </div>
  );
}
