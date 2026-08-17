import type { Metadata } from "next";
import Link from "next/link";
import { detectarFurosDeTodas } from "@/lib/matching/furos";
import { EstadoVazio } from "../_components/estados";
import { AcoesFuro } from "./acoes-furo";
import { CORES_SEVERIDADE, RANK_SEVERIDADE, tituloTaskDoFuro } from "./rotulos";

export const metadata: Metadata = { title: "Furos — Copiloto Dnaccarato" };

// Dado sempre fresco: reflete o estado atual de todas as alunas a cada acesso.
export const dynamic = "force-dynamic";

export default async function FurosPage() {
  const alunasComFuros = await detectarFurosDeTodas();

  // Achata para uma lista única {aluna, furo} e ordena por urgência global.
  const itens = alunasComFuros
    .flatMap(({ aluna, furos }) => furos.map((furo) => ({ aluna, furo })))
    .sort(
      (a, b) => RANK_SEVERIDADE[a.furo.severidade] - RANK_SEVERIDADE[b.furo.severidade],
    );

  return (
    <section className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Furos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pendências detectadas em todas as alunas, mais urgentes primeiro.
          </p>
        </div>
        <span className="text-sm text-slate-500">{itens.length} no total</span>
      </div>

      <div className="mt-6">
        {itens.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum furo detectado. 🎉"
            descricao="Quando alguma aluna ficar com pendência (rejeição, pagamento, follow-up…), ela aparece aqui."
          />
        ) : (
          <ul className="space-y-3">
            {itens.map(({ aluna, furo }, i) => (
              <li
                key={`${aluna.id}-${furo.tipo}-${i}`}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CORES_SEVERIDADE[furo.severidade]}`}
                      >
                        {furo.severidade}
                      </span>
                      <Link
                        href={`/alunas/${aluna.id}`}
                        className="text-sm font-semibold text-slate-900 hover:underline"
                      >
                        {aluna.nome}
                      </Link>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{furo.mensagem}</p>
                  </div>

                  <div className="shrink-0">
                    <AcoesFuro alunaId={aluna.id} tituloTask={tituloTaskDoFuro(furo)} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
