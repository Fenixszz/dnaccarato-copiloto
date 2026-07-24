import { coletarFurosDeTodasAsAlunas, ordenarFuros } from "@/lib/briefing/priorizar";
import { registrarErroDeRota } from "@/lib/log";
import type { TipoDeFuro } from "@/lib/matching/furos";
import { AcoesFuro } from "./acoes-furo";

const ROTULO_FURO: Record<TipoDeFuro, string> = {
  pagamento_atrasado: "Pagamento atrasado",
  pagou_sem_contrato_assinado: "Pagou sem contrato assinado",
  assinou_sem_reuniao: "Assinou sem reunião marcada",
  formulario_sem_followup: "Formulário sem follow-up",
  task_parada: "Task parada",
};

export default async function PaginaFuros() {
  let furos;
  try {
    furos = ordenarFuros(await coletarFurosDeTodasAsAlunas());
  } catch (erro) {
    registrarErroDeRota({ rota: "/furos" }, erro);
    return (
      <section>
        <h2 className="font-medium">Furos</h2>
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar os furos agora. Recarregue a página em instantes.
        </p>
      </section>
    );
  }

  if (furos.length === 0) {
    return (
      <section>
        <h2 className="font-medium">Furos</h2>
        <p className="mt-4 rounded-lg border p-4 text-sm text-neutral-500">
          Nenhum furo detectado — está tudo em dia. 🎉
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="font-medium">Furos</h2>
      <p className="mt-1 text-sm text-neutral-500">
        {furos.length} {furos.length === 1 ? "item" : "itens"} pra resolver, do mais urgente pro
        menos.
      </p>
      <ul className="mt-4 divide-y rounded-lg border">
        {furos.map((furo, indice) => (
          <li
            key={`${furo.aluna_id}:${furo.tipo}:${indice}`}
            className="flex flex-wrap items-start justify-between gap-3 p-3"
          >
            <div>
              <p className="font-medium">{furo.aluna_nome}</p>
              <p className="text-sm text-red-600">{ROTULO_FURO[furo.tipo] ?? furo.tipo}</p>
              <p className="text-sm text-neutral-500">{furo.detalhe}</p>
            </div>
            <AcoesFuro alunaId={furo.aluna_id} tipo={furo.tipo} detalhe={furo.detalhe} />
          </li>
        ))}
      </ul>
    </section>
  );
}
