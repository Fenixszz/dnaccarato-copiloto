/** Estado de loading da lista de alunas. */
export default function Loading() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-semibold text-marca-grafite">Alunas</h1>
      <div className="mt-4 h-10 w-full animate-pulse rounded-lg bg-marca-nevoa" />
      <div className="mt-6 overflow-hidden rounded-xl border border-marca-nevoa bg-white shadow-sm">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 border-b border-marca-nevoa px-4 py-3 last:border-0"
          >
            <div className="h-4 w-40 animate-pulse rounded bg-marca-nevoa" />
            <div className="h-4 w-56 animate-pulse rounded bg-marca-nevoa" />
            <div className="h-4 w-32 animate-pulse rounded bg-marca-nevoa" />
          </div>
        ))}
      </div>
    </section>
  );
}
