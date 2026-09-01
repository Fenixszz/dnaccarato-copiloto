/** Estado de loading da tela de tarefas. */
export default function Loading() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold text-marca-grafite">Tarefas</h1>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-marca-nevoa bg-white"
          />
        ))}
      </div>
    </section>
  );
}
