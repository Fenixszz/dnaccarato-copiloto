"use client";

import { useFormState, useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";

const ESTADO_INICIAL: LoginState = { erro: null };

const CLASSE_CAMPO =
  "w-full rounded-lg border border-marca-areia bg-white px-3.5 py-2.5 text-sm text-marca-grafite shadow-sm outline-none transition placeholder:text-marca-texto/60 focus:border-marca-caramelo focus:ring-2 focus:ring-marca-caramelo/25 disabled:cursor-not-allowed disabled:opacity-60";

const CLASSE_LABEL =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-marca-texto";

function BotaoEntrar() {
  // `pending` é o estado de loading da própria submissão do form.
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-marca-caramelo px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-marca-caramelo/25 transition hover:bg-marca-caramelo-escuro focus:outline-none focus:ring-2 focus:ring-marca-caramelo/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? (
        <>
          <svg
            className="h-4 w-4 animate-spin text-white"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          Entrando…
        </>
      ) : (
        "Entrar"
      )}
    </button>
  );
}

export function LoginForm({ proximo }: { proximo?: string }) {
  const [state, formAction] = useFormState(login, ESTADO_INICIAL);

  return (
    <form action={formAction} className="space-y-5">
      {proximo ? <input type="hidden" name="proximo" value={proximo} /> : null}

      <div>
        <label htmlFor="email" className={CLASSE_LABEL}>
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="voce@drinaccarato.com.br"
          autoComplete="email"
          required
          autoFocus
          className={CLASSE_CAMPO}
        />
      </div>

      <div>
        <label htmlFor="senha" className={CLASSE_LABEL}>
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
          className={CLASSE_CAMPO}
        />
      </div>

      {state.erro !== null ? (
        <p
          role="alert"
          aria-live="polite"
          className="flex items-start gap-2 rounded-lg border border-marca-vinho/20 bg-marca-vinho/5 px-3.5 py-2.5 text-sm text-marca-vinho"
        >
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-marca-vinho"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-5a1 1 0 100 2 1 1 0 000-2z"
              clipRule="evenodd"
            />
          </svg>
          <span>{state.erro}</span>
        </p>
      ) : null}

      <BotaoEntrar />
    </form>
  );
}
