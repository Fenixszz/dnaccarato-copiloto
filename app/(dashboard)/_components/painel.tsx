/**
 * Componentes de apresentação do painel inicial (server components, sem JS no
 * cliente). Só UI — os números vêm agregados de `carregarPainelInicio`.
 */
import Link from "next/link";
import { formatarMoeda, formatarDataHora } from "@/lib/formato";
import type { BarraMes } from "@/lib/painel/metricas";
import type { ProximaReuniao, ResumoFuros } from "@/lib/painel/carregar";

/** Moeda compacta pro topo das barras: "R$ 1,2 mil". */
function moedaCompacta(valor: number): string {
  if (valor <= 0) return "";
  if (valor >= 1000) {
    return `R$ ${(valor / 1000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })} mil`;
  }
  return `R$ ${valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

/** Seta de variação percentual (▲ verde / ▼ vinho). */
export function Variacao({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-xs text-marca-texto/70">sem base de comparação</span>;
  }
  const subiu = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        subiu ? "text-emerald-600" : "text-marca-vinho"
      }`}
    >
      <span aria-hidden>{subiu ? "▲" : "▼"}</span>
      {Math.abs(pct)}% vs. mês anterior
    </span>
  );
}

/** Cartão de KPI em destaque. */
export function CardKpi({
  rotulo,
  valor,
  sub,
  icone,
  href,
}: {
  rotulo: string;
  valor: string;
  sub?: React.ReactNode;
  icone: React.ReactNode;
  href?: string;
}) {
  const conteudo = (
    <>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-marca-texto">{rotulo}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-marca-caramelo/10 text-marca-caramelo">
          {icone}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-marca-grafite">
        {valor}
      </p>
      {sub ? <div className="mt-1.5">{sub}</div> : null}
    </>
  );
  const base = "block rounded-2xl border border-marca-nevoa bg-white p-5 shadow-sm";
  return href ? (
    <Link href={href} className={`${base} transition-shadow hover:shadow-md`}>
      {conteudo}
    </Link>
  ) : (
    <div className={base}>{conteudo}</div>
  );
}

/** Gráfico de barras (SSR, sem lib) dos recebimentos dos últimos 6 meses. */
export function GraficoRecebimentos({ barras }: { barras: BarraMes[] }) {
  const max = Math.max(1, ...barras.map((b) => b.valor));
  const totalSemestre = barras.reduce((s, b) => s + b.valor, 0);

  return (
    <div className="rounded-2xl border border-marca-nevoa bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold text-marca-grafite">Recebimentos</h2>
          <p className="mt-0.5 text-xs text-marca-texto">Últimos 6 meses</p>
        </div>
        <p className="text-sm font-semibold tabular-nums text-marca-grafite">
          {formatarMoeda(totalSemestre)}
        </p>
      </div>

      <div className="mt-6 flex h-44 items-end gap-2 sm:gap-4">
        {barras.map((b) => (
          <div
            key={`${b.ano}-${b.mes}`}
            className="flex h-full flex-1 flex-col justify-end"
          >
            <span className="mb-1 text-center text-[10px] font-medium tabular-nums text-marca-texto/80">
              {moedaCompacta(b.valor)}
            </span>
            <div
              className="w-full rounded-t-md bg-marca-caramelo/85 transition-colors hover:bg-marca-caramelo"
              style={{
                height: `${(b.valor / max) * 100}%`,
                minHeight: b.valor > 0 ? "6px" : "3px",
              }}
              title={`${b.rotulo}/${b.ano}: ${formatarMoeda(b.valor)}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 sm:gap-4">
        {barras.map((b) => (
          <div
            key={`lbl-${b.ano}-${b.mes}`}
            className="flex-1 text-center text-xs capitalize text-marca-texto"
          >
            {b.rotulo}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lista das próximas reuniões. */
export function ProximasReunioes({
  reunioes,
  totalSemana,
}: {
  reunioes: ProximaReuniao[];
  totalSemana: number;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-marca-nevoa bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-marca-grafite">Próximas reuniões</h2>
        <span className="rounded-full bg-marca-agua/20 px-2 py-0.5 text-xs font-medium text-marca-grafite">
          {totalSemana} nesta semana
        </span>
      </div>

      {reunioes.length === 0 ? (
        <p className="mt-4 text-sm text-marca-texto/70">
          Nenhuma reunião agendada à frente.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {reunioes.map((r) => (
            <li key={r.id} className="flex items-center gap-3">
              <span
                className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-marca-caramelo"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-marca-grafite">
                  {r.aluna_nome}
                </p>
                <p className="text-xs capitalize text-marca-texto">
                  {formatarDataHora(r.data_hora)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Tile compacto (rótulo + número + rodapé opcional), linkável. */
export function Tile({
  rotulo,
  valor,
  rodape,
  href,
  tom = "neutro",
}: {
  rotulo: string;
  valor: number | string;
  rodape?: React.ReactNode;
  href?: string;
  tom?: "neutro" | "alerta";
}) {
  const cor =
    tom === "alerta" && Number(valor) > 0 ? "text-marca-vinho" : "text-marca-grafite";
  const conteudo = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-marca-texto">
        {rotulo}
      </p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${cor}`}>{valor}</p>
      {rodape ? <div className="mt-1 text-xs text-marca-texto/80">{rodape}</div> : null}
    </>
  );
  const base = "block rounded-2xl border border-marca-nevoa bg-white p-5 shadow-sm";
  return href ? (
    <Link href={href} className={`${base} transition-shadow hover:shadow-md`}>
      {conteudo}
    </Link>
  ) : (
    <div className={base}>{conteudo}</div>
  );
}

/** Rodapé do tile de furos: contagem por severidade. */
export function ResumoFurosRodape({ furos }: { furos: ResumoFuros }) {
  if (furos.total === 0) return <span>tudo em dia 🎉</span>;
  const partes: string[] = [];
  if (furos.criticas > 0)
    partes.push(`${furos.criticas} crítica${furos.criticas > 1 ? "s" : ""}`);
  if (furos.altas > 0) partes.push(`${furos.altas} alta${furos.altas > 1 ? "s" : ""}`);
  if (furos.medias > 0)
    partes.push(`${furos.medias} média${furos.medias > 1 ? "s" : ""}`);
  return <span>{partes.join(" · ")}</span>;
}
