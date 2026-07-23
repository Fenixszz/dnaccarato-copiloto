"use client";

import { useActionState } from "react";
import { entrar, type EstadoLogin } from "./acoes";

const ESTADO_INICIAL: EstadoLogin = { erro: null };

export function FormularioLogin() {
  const [estado, acao, pendente] = useActionState(entrar, ESTADO_INICIAL);

  return (
    <form action={acao} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          disabled={pendente}
          className="rounded border p-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Senha
        <input
          type="password"
          name="senha"
          required
          autoComplete="current-password"
          disabled={pendente}
          className="rounded border p-2"
        />
      </label>

      {estado.erro && (
        <p role="alert" className="text-sm text-red-600">
          {estado.erro}
        </p>
      )}

      <button
        type="submit"
        disabled={pendente}
        className="rounded bg-neutral-900 p-2 text-white disabled:opacity-60"
      >
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
