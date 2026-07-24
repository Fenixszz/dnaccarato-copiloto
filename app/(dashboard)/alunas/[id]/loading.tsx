export default function CarregandoDossie() {
  return (
    <section>
      <div className="h-4 w-32 animate-pulse rounded bg-neutral-200" />
      <div className="mt-3 h-6 w-48 animate-pulse rounded bg-neutral-200" />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border p-4">
            <div className="h-4 w-24 animate-pulse rounded bg-neutral-200" />
            <div className="mt-3 h-4 w-full animate-pulse rounded bg-neutral-200" />
            <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-neutral-200" />
          </div>
        ))}
      </div>
    </section>
  );
}
