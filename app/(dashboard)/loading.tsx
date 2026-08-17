import { CardSkeleton, GradeCards } from "./_components/cards";

/** Estado de loading da home: mostrado enquanto as contagens são carregadas. */
export default function Loading() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Painel do Copiloto</h1>
      <p className="mt-1 text-sm text-slate-500">Carregando…</p>
      <div className="mt-6">
        <GradeCards>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </GradeCards>
      </div>
    </section>
  );
}
