import type { Metadata } from "next";
import Link from "next/link";
import { listarAlunas } from "@/lib/db/queries";
import { filtrarAlunas } from "@/lib/alunas/busca";
import { formatarData } from "@/lib/formato";
import { EstadoVazio } from "../_components/estados";

export const metadata: Metadata = { title: "Alunas — Copiloto Naccarato" };

// Dado sempre fresco: reflete o cadastro atual a cada acesso/busca.
export const dynamic = "force-dynamic";

export default async function AlunasPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const termo = (searchParams.q ?? "").trim();
  const todas = await listarAlunas();
  const alunas = filtrarAlunas(todas, termo);

  return (
    <section className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-marca-grafite">Alunas</h1>
        <span className="text-sm text-marca-texto">
          {alunas.length} de {todas.length}
        </span>
      </div>

      {/* Busca por GET: sem JS no cliente, funciona com o loading de navegação. */}
      <form method="get" className="mt-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={termo}
          placeholder="Buscar por nome, e-mail ou telefone…"
          aria-label="Buscar alunas"
          className="w-full rounded-lg border border-marca-areia px-3 py-2 text-sm shadow-sm focus:border-marca-caramelo focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-marca-caramelo px-4 py-2 text-sm font-medium text-white hover:bg-marca-caramelo-escuro"
        >
          Buscar
        </button>
        {termo ? (
          <Link
            href="/alunas"
            className="rounded-lg border border-marca-areia px-4 py-2 text-sm font-medium text-marca-grafite hover:bg-marca-nevoa"
          >
            Limpar
          </Link>
        ) : null}
      </form>

      <div className="mt-6">
        {todas.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma aluna cadastrada ainda."
            descricao="Importe as alunas ou aguarde os webhooks para elas aparecerem aqui."
          />
        ) : alunas.length === 0 ? (
          <EstadoVazio
            titulo={`Nenhuma aluna encontrada para “${termo}”.`}
            descricao="Tente outro nome, e-mail ou telefone."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-marca-nevoa bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-marca-nevoa bg-marca-creme text-xs uppercase tracking-wide text-marca-texto">
                <tr>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">E-mail</th>
                  <th className="px-4 py-3 font-medium">Telefone</th>
                  <th className="px-4 py-3 font-medium">Cadastro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-marca-nevoa">
                {alunas.map((aluna) => (
                  <tr key={aluna.id} className="hover:bg-marca-creme">
                    <td className="px-4 py-3">
                      <Link
                        href={`/alunas/${aluna.id}`}
                        className="font-medium text-marca-grafite hover:text-marca-texto hover:underline"
                      >
                        {aluna.nome}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-marca-texto">{aluna.email ?? "—"}</td>
                    <td className="px-4 py-3 text-marca-texto">
                      {aluna.telefone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-marca-texto">
                      {formatarData(aluna.criado_em)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
