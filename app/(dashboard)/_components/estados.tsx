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
      className="rounded-xl border border-red-200 bg-red-50 p-6 text-center"
    >
      <p className="text-sm font-medium text-red-800">{titulo}</p>
      <p className="mt-1 text-sm text-red-600">{descricao}</p>
      {reset ? (
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
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
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-sm font-medium text-slate-700">{titulo}</p>
      {descricao ? <p className="mt-1 text-sm text-slate-500">{descricao}</p> : null}
    </div>
  );
}
