// Estado de loading da tela inicial: esqueletos dos 4 cards enquanto o
// resumo é buscado no servidor (fallback de Suspense do segmento).
export default function CarregandoDashboard() {
  return (
    <section>
      <h2 className="font-medium">Visão geral</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border p-4">
            <div className="h-4 w-24 animate-pulse rounded bg-neutral-200" />
            <div className="mt-2 h-8 w-12 animate-pulse rounded bg-neutral-200" />
          </div>
        ))}
      </div>
    </section>
  );
}
