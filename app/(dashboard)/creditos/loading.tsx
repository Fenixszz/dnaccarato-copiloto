/** Estado de loading da tela de créditos. */
export default function Loading() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Créditos</h1>
      <div className="mt-6 h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
      <div className="mt-6 h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />
    </section>
  );
}
