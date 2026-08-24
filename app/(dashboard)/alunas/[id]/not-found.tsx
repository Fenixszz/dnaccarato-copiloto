import Link from "next/link";

/** Aluna inexistente (id inválido ou não encontrada). */
export default function NotFound() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-8">
      <div className="rounded-xl border border-dashed border-marca-areia bg-white p-10 text-center">
        <p className="text-sm font-medium text-marca-grafite">Aluna não encontrada.</p>
        <p className="mt-1 text-sm text-marca-texto">
          O cadastro pode ter sido removido ou o link está incorreto.
        </p>
        <Link
          href="/alunas"
          className="mt-4 inline-block rounded-lg bg-marca-caramelo px-4 py-2 text-sm font-medium text-white hover:bg-marca-caramelo-escuro"
        >
          Ver todas as alunas
        </Link>
      </div>
    </section>
  );
}
