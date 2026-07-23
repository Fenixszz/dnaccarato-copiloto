export function Cartao({
  titulo,
  valor,
  destaque = false,
}: {
  titulo: string;
  valor: number;
  // Realça quando o número pede atenção (atrasos, pendências > 0).
  destaque?: boolean;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-neutral-500">{titulo}</p>
      <p className={`mt-1 text-3xl font-semibold ${destaque && valor > 0 ? "text-red-600" : ""}`}>
        {valor}
      </p>
    </div>
  );
}
