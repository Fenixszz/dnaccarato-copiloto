import Link from "next/link";

/** Aluna inexistente (id inválido ou não encontrada). */
export default function NotFound() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-8">
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-sm font-medium text-slate-700">Aluna não encontrada.</p>
        <p className="mt-1 text-sm text-slate-500">
          O cadastro pode ter sido removido ou o link está incorreto.
        </p>
        <Link
          href="/alunas"
          className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Ver todas as alunas
        </Link>
      </div>
    </section>
  );
}
