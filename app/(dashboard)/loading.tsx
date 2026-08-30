/** Estado de loading da home: esqueleto no mesmo shape do painel. */
export default function Loading() {
  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <div className="h-8 w-56 animate-pulse rounded bg-marca-nevoa" />
        <div className="mt-2 h-4 w-40 animate-pulse rounded bg-marca-nevoa/60" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-marca-nevoa bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="h-4 w-24 animate-pulse rounded bg-marca-nevoa" />
              <div className="h-9 w-9 animate-pulse rounded-xl bg-marca-nevoa" />
            </div>
            <div className="mt-4 h-8 w-28 animate-pulse rounded bg-marca-nevoa" />
            <div className="mt-2 h-3 w-32 animate-pulse rounded bg-marca-nevoa/60" />
          </div>
        ))}
      </div>

      {/* Gráfico + reuniões */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-64 animate-pulse rounded-2xl border border-marca-nevoa bg-white shadow-sm lg:col-span-2" />
        <div className="h-64 animate-pulse rounded-2xl border border-marca-nevoa bg-white shadow-sm" />
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-marca-nevoa bg-white shadow-sm"
          />
        ))}
      </div>
    </section>
  );
}
