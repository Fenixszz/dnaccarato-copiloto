import { carregarPainelInicio } from "@/lib/painel/carregar";
import { formatarMoeda } from "@/lib/formato";
import { EstadoVazio } from "./_components/estados";
import {
  CardKpi,
  Variacao,
  GraficoRecebimentos,
  ProximasReunioes,
  Tile,
  ResumoFurosRodape,
} from "./_components/painel";

// Dado sempre fresco: a home reflete o estado atual do banco a cada acesso.
export const dynamic = "force-dynamic";

// Ícones (inline, sem dependência) dos cartões de KPI.
const IconeReceber = (
  <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
    <path
      d="M3 6.5A1.5 1.5 0 0 1 4.5 5h11A1.5 1.5 0 0 1 17 6.5v7A1.5 1.5 0 0 1 15.5 15h-11A1.5 1.5 0 0 1 3 13.5v-7Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <circle cx="10" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);
const IconeAlerta = (
  <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
    <path
      d="M10 6.5v4M10 13.5h.01M8.7 3.4 2.5 14.2A1.5 1.5 0 0 0 3.8 16.5h12.4a1.5 1.5 0 0 0 1.3-2.3L11.3 3.4a1.5 1.5 0 0 0-2.6 0Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const IconeAlunas = (
  <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
    <circle cx="7.5" cy="7" r="2.75" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M2.5 16c0-2.5 2.24-4 5-4s5 1.5 5 4M13.5 6.2a2.5 2.5 0 0 1 0 4.6M15 15.6c1.6.3 2.5 1.2 2.5 2.4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
const IconeAdimplencia = (
  <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
    <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="m6.8 10.2 2 2 4.4-4.6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default async function DashboardHomePage() {
  const painel = await carregarPainelInicio();
  const m = painel.metricas;

  // Estado vazio: sistema ainda sem alunas cadastradas (nada a resumir).
  if (m.alunasAtivas === 0) {
    return (
      <section className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-marca-grafite">Painel do Copiloto</h1>
        <div className="mt-6">
          <EstadoVazio
            titulo="Nenhuma aluna cadastrada ainda."
            descricao="Assim que as alunas forem importadas ou os webhooks começarem a chegar, os totais aparecem aqui."
          />
        </div>
      </section>
    );
  }

  const hoje = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-marca-grafite">Painel do Copiloto</h1>
        <p className="mt-1 text-sm capitalize text-marca-texto">{hoje}</p>
      </div>

      {/* KPIs em destaque */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          rotulo="Recebido no mês"
          valor={formatarMoeda(m.recebidoMes)}
          icone={IconeReceber}
          sub={<Variacao pct={m.variacaoRecebidoPct} />}
        />
        <CardKpi
          rotulo="Em aberto"
          valor={formatarMoeda(m.emAberto)}
          icone={IconeAlerta}
          href="/furos"
          sub={
            <span className="text-xs text-marca-texto">
              {m.qtdAtrasados}{" "}
              {m.qtdAtrasados === 1 ? "cobrança atrasada" : "cobranças atrasadas"}
            </span>
          }
        />
        <CardKpi
          rotulo="Alunas ativas"
          valor={String(m.alunasAtivas)}
          icone={IconeAlunas}
          href="/alunas"
          sub={
            <span
              className={`text-xs font-medium ${
                m.alunasNovas30d > 0 ? "text-emerald-600" : "text-marca-texto"
              }`}
            >
              {m.alunasNovas30d > 0 ? `+${m.alunasNovas30d}` : "0"} nos últimos 30 dias
            </span>
          }
        />
        <CardKpi
          rotulo="Adimplência"
          valor={m.taxaAdimplenciaPct === null ? "—" : `${m.taxaAdimplenciaPct}%`}
          icone={IconeAdimplencia}
          sub={<span className="text-xs text-marca-texto">cobranças em dia</span>}
        />
      </div>

      {/* Gráfico + próximas reuniões */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <GraficoRecebimentos barras={m.recebimentoPorMes} />
        </div>
        <ProximasReunioes
          reunioes={painel.proximasReunioes}
          totalSemana={painel.reunioesSemana}
        />
      </div>

      {/* Tiles secundários */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          rotulo="Docs pendentes"
          valor={m.documentosPendentes}
          tom="alerta"
          rodape="aguardando assinatura"
        />
        <Tile
          rotulo="Docs rejeitados"
          valor={m.documentosRejeitados}
          tom="alerta"
          rodape="precisam de novo envio"
        />
        <Tile
          rotulo="Furos"
          valor={painel.furos.total}
          href="/furos"
          tom="alerta"
          rodape={<ResumoFurosRodape furos={painel.furos} />}
        />
        <Tile
          rotulo="Créditos"
          valor={formatarMoeda(painel.saldoCentavos / 100)}
          href="/creditos"
          rodape="saldo do copiloto"
        />
      </div>
    </section>
  );
}
