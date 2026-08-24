import type { Metadata } from "next";
import Link from "next/link";
import { detectarFurosDeTodas } from "@/lib/matching/furos";
import { EstadoVazio } from "../_components/estados";
import { CORES_SEVERIDADE, RANK_SEVERIDADE } from "./rotulos";

export const metadata: Metadata = { title: "Furos — Copiloto Naccarato" };

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
          <h1 className="text-xl font-semibold text-marca-grafite">Furos</h1>
          <p className="mt-1 text-sm text-marca-texto">
            Pendências detectadas em todas as alunas, mais urgentes primeiro.
          </p>
        </div>
        <span className="text-sm text-marca-texto">{itens.length} no total</span>
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
                className="rounded-xl border border-marca-nevoa bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CORES_SEVERIDADE[furo.severidade]}`}
                    >
                      {furo.severidade}
                    </span>
                    <Link
                      href={`/alunas/${aluna.id}`}
                      className="text-sm font-semibold text-marca-grafite hover:underline"
                    >
                      {aluna.nome}
                    </Link>
                  </div>
                  <p className="mt-1 text-sm text-marca-texto">{furo.mensagem}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
