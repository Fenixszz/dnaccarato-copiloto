/** Estado de loading da tela de créditos. */
export default function Loading() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold text-marca-grafite">Créditos</h1>
      <div className="mt-6 h-28 animate-pulse rounded-xl border border-marca-nevoa bg-white" />
      <div className="mt-6 h-24 animate-pulse rounded-xl border border-marca-nevoa bg-white" />
    </section>
  );
}
