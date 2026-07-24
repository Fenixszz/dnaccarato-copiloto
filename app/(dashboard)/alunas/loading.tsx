export default function CarregandoAlunas() {
  return (
    <section>
      <h2 className="font-medium">Alunas</h2>
      <div className="mt-4 h-9 w-full max-w-md animate-pulse rounded bg-neutral-200" />
      <ul className="mt-4 divide-y rounded-lg border">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="p-3">
            <div className="h-4 w-40 animate-pulse rounded bg-neutral-200" />
          </li>
        ))}
      </ul>
    </section>
  );
}
