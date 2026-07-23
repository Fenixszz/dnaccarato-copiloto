import { montarResumoDashboard } from "@/lib/dashboard/resumo";
import { registrarErroDeRota } from "@/lib/log";
import { Cartao } from "./cartao";

export default async function PaginaInicialDashboard() {
  let resumo;
  try {
    resumo = await montarResumoDashboard();
  } catch (erro) {
    registrarErroDeRota({ rota: "/(dashboard)" }, erro);
    return (
      <section>
        <h2 className="font-medium">Visão geral</h2>
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar os totais agora. Recarregue a página em instantes.
        </p>
      </section>
    );
  }

  // Estado vazio: banco ainda sem alunas (nada foi ingerido/cadastrado).
  if (resumo.alunas === 0) {
    return (
      <section>
        <h2 className="font-medium">Visão geral</h2>
        <p className="mt-4 rounded-lg border p-4 text-sm text-neutral-500">
          Nenhuma aluna cadastrada ainda. Os totais aparecem aqui assim que as integrações começarem
          a trazer dados.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="font-medium">Visão geral</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao titulo="Alunas ativas" valor={resumo.alunas} />
        <Cartao titulo="Pagamentos em atraso" valor={resumo.pagamentosEmAtraso} destaque />
        <Cartao titulo="Documentos pendentes" valor={resumo.documentosPendentes} destaque />
        <Cartao titulo="Reuniões da semana" valor={resumo.reunioesDaSemana} />
      </div>
    </section>
  );
}
