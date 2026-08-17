"use client";

import { useFormState, useFormStatus } from "react-dom";
import { acaoRapida, type EstadoAcao } from "./actions";

const ESTADO_INICIAL: EstadoAcao = { ok: false, mensagem: null };

function Botoes() {
  // `pending` cobre o form inteiro: enquanto uma ação roda, ambos os botões
  // ficam desabilitados (evita disparo duplo).
  const { pending } = useFormStatus();
  const base =
    "rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed";
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="submit"
        name="acao"
        value="enviar_lembrete_pagamento"
        disabled={pending}
        className={`${base} border-slate-300 text-slate-700 hover:bg-slate-100`}
      >
        Mandar lembrete
      </button>
      <button
        type="submit"
        name="acao"
        value="criar_task_asana"
        disabled={pending}
        className={`${base} border-slate-900 bg-slate-900 text-white hover:bg-slate-800`}
      >
        Criar task
      </button>
    </div>
  );
}

/**
 * Botões de ação rápida de um furo. Um form só com dois submits (name="acao"),
 * cada um disparando a tool MCP correspondente. Feedback fica na própria linha.
 */
export function AcoesFuro({
  alunaId,
  tituloTask,
}: {
  alunaId: string;
  tituloTask: string;
}) {
  const [estado, formAction] = useFormState(acaoRapida, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="aluna_id" value={alunaId} />
      <input type="hidden" name="titulo" value={tituloTask} />
      <Botoes />
      {estado.mensagem !== null ? (
        <p
          role="status"
          className={`text-xs ${estado.ok ? "text-emerald-700" : "text-red-600"}`}
        >
          {estado.mensagem}
        </p>
      ) : null}
    </form>
  );
}
