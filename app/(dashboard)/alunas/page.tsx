import Link from "next/link";
import { filtrarAlunas, listarAlunas } from "@/lib/alunas/busca";
import { registrarErroDeRota } from "@/lib/log";

export default async function PaginaListaAlunas({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const termo = q?.trim() ?? "";

  const busca = (
    <form action="/alunas" method="get" className="mt-4 flex gap-2">
      <input
        type="search"
        name="q"
        defaultValue={termo}
        placeholder="Buscar por nome, email ou telefone"
        className="w-full max-w-md rounded border p-2 text-sm"
      />
      <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm text-white">
        Buscar
      </button>
    </form>
  );

  let alunas;
  try {
    alunas = filtrarAlunas(await listarAlunas(), termo);
  } catch (erro) {
    registrarErroDeRota({ rota: "/alunas" }, erro);
    return (
      <section>
        <h2 className="font-medium">Alunas</h2>
        {busca}
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar as alunas agora. Recarregue a página em instantes.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="font-medium">Alunas</h2>
      {busca}

      {alunas.length === 0 ? (
        <p className="mt-4 rounded-lg border p-4 text-sm text-neutral-500">
          {termo === ""
            ? "Nenhuma aluna cadastrada ainda."
            : `Nenhuma aluna encontrada para “${termo}”.`}
        </p>
      ) : (
        <ul className="mt-4 divide-y rounded-lg border">
          {alunas.map((aluna) => (
            <li key={aluna.id}>
              <Link
                href={`/alunas/${aluna.id}`}
                className="flex items-center justify-between gap-4 p-3 hover:bg-neutral-50"
              >
                <span className="font-medium">{aluna.nome}</span>
                <span className="text-sm text-neutral-500">
                  {aluna.email ?? aluna.telefone ?? ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
