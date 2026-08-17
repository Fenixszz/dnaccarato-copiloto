"use client";

import { useFormState, useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";

const ESTADO_INICIAL: LoginState = { erro: null };

function BotaoEntrar() {
  // `pending` é o estado de loading da própria submissão do form.
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export function LoginForm({ proximo }: { proximo?: string }) {
  const [state, formAction] = useFormState(login, ESTADO_INICIAL);

  return (
    <form action={formAction}>
      {proximo ? <input type="hidden" name="proximo" value={proximo} /> : null}

      <div>
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />
      </div>

      <div>
        <label htmlFor="senha">Senha</label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state.erro !== null ? (
        <p role="alert" aria-live="polite">
          {state.erro}
        </p>
      ) : null}

      <BotaoEntrar />
    </form>
  );
}
