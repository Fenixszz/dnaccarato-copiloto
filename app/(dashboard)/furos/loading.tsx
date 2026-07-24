export default function CarregandoFuros() {
  return (
    <section>
      <h2 className="font-medium">Furos</h2>
      <ul className="mt-4 divide-y rounded-lg border">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="p-3">
            <div className="h-4 w-40 animate-pulse rounded bg-neutral-200" />
            <div className="mt-2 h-3 w-56 animate-pulse rounded bg-neutral-200" />
          </li>
        ))}
      </ul>
    </section>
  );
}
