/** Estado de loading do dossiê da aluna. */
export default function Loading() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="h-4 w-32 animate-pulse rounded bg-marca-nevoa" />
      <div className="mt-3 h-7 w-64 animate-pulse rounded bg-marca-nevoa" />
      <div className="mt-2 h-4 w-80 animate-pulse rounded bg-marca-nevoa" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-marca-nevoa" />
        ))}
      </div>
      <div className="mt-6 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-marca-nevoa" />
        ))}
      </div>
    </section>
  );
}
