"use client";

import { useEffect } from "react";

/**
 * Boundary de erro global — última rede de segurança do app.
 *
 * Por que existe: um `error.tsx` NÃO captura erros lançados no `layout.tsx` do
 * mesmo segmento. O layout de (dashboard) lê a sessão (`getUser()`); se isso
 * falhar (Supabase/rede fora), o erro escapa dos boundaries das telas. Este
 * global-error garante um estado de erro com botão de retry mesmo nesse caso.
 *
 * Como substitui o layout raiz, precisa renderizar seu próprio <html>/<body> e
 * não pode depender do CSS da aplicação — por isso os estilos são inline.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erro global (fora dos boundaries de tela):", error.message);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <main
          role="alert"
          style={{
            maxWidth: "28rem",
            padding: "2rem",
            textAlign: "center",
            border: "1px solid #fecaca",
            background: "#fef2f2",
            borderRadius: "0.75rem",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, color: "#991b1b" }}>
            Algo deu errado ao carregar o painel.
          </p>
          <p style={{ marginTop: "0.25rem", fontSize: "0.875rem", color: "#dc2626" }}>
            Pode ter sido uma falha temporária de conexão. Tente novamente.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#ffffff",
              background: "#dc2626",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
