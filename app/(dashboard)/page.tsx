import { contarResumoDashboard } from "@/lib/db/queries";
import { CardMetrica, GradeCards } from "./_components/cards";
import { EstadoVazio } from "./_components/estados";

// Dado sempre fresco: a home reflete o estado atual do banco a cada acesso.
export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  const resumo = await contarResumoDashboard();

  // Estado vazio: sistema ainda sem alunas cadastradas (nada a resumir).
  if (resumo.alunasAtivas === 0) {
    return (
      <section className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Painel do Copiloto</h1>
        <div className="mt-6">
          <EstadoVazio
            titulo="Nenhuma aluna cadastrada ainda."
            descricao="Assim que as alunas forem importadas ou os webhooks começarem a chegar, os totais aparecem aqui."
          />
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Painel do Copiloto</h1>
      <p className="mt-1 text-sm text-slate-500">Visão geral de hoje.</p>

      <div className="mt-6">
        <GradeCards>
          <CardMetrica
            titulo="Alunas ativas"
            valor={resumo.alunasAtivas}
            descricao="Total de alunas cadastradas"
            tom="neutro"
            href="/alunas"
          />
          <CardMetrica
            titulo="Pagamentos em atraso"
            valor={resumo.pagamentosEmAtraso}
            descricao="Cobranças com status atrasado"
            tom="alerta"
          />
          <CardMetrica
            titulo="Documentos pendentes"
            valor={resumo.documentosPendentesRejeitados}
            descricao="Pendentes ou rejeitados"
            tom="alerta"
          />
          <CardMetrica
            titulo="Reuniões da semana"
            valor={resumo.reunioesDaSemana}
            descricao="Agendadas de segunda a domingo"
            tom="info"
          />
        </GradeCards>
      </div>
    </section>
  );
}
