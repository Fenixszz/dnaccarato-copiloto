"use client";

/**
 * Estados compartilhados de erro e vazio das telas do dashboard (CLAUDE.md:
 * toda tela tem loading, erro e vazio). O de erro tem botão de retry, então o
 * arquivo é client component.
 */

export function EstadoErro({
  titulo = "Algo deu errado.",
  descricao = "Tente novamente em instantes.",
  reset,
}: {
  titulo?: string;
  descricao?: string;
  reset?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-marca-vinho/20 bg-marca-vinho/5 p-6 text-center"
    >
      <p className="text-sm font-medium text-marca-vinho">{titulo}</p>
      <p className="mt-1 text-sm text-marca-vinho/80">{descricao}</p>
      {reset ? (
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-marca-vinho px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-vinho/90"
        >
          Tentar de novo
        </button>
      ) : null}
    </div>
  );
}

export function EstadoVazio({
  titulo,
  descricao,
}: {
  titulo: string;
  descricao?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-marca-areia bg-white p-10 text-center">
      <p className="text-sm font-medium text-marca-grafite">{titulo}</p>
      {descricao ? <p className="mt-1 text-sm text-marca-texto">{descricao}</p> : null}
    </div>
  );
}
