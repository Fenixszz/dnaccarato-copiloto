/**
 * Gráfico simples (server component, sem JS) do consumo REAL de IA da Anthropic
 * nos últimos 30 dias, pro João conferir se a estimativa bate com o real.
 * Barras verticais proporcionais ao dia de maior custo.
 */
import type { DiaCustoReal } from "@/lib/integrations/anthropic-admin";
import { formatarUsd, formatarMoeda, formatarData } from "@/lib/formato";

export function GraficoConsumoReal({
  dias,
  totalCentavosUsd,
  estimadoBrlCentavos,
}: {
  dias: DiaCustoReal[];
  totalCentavosUsd: number;
  /** Nossa estimativa (BRL centavos) de IA no mesmo período, pra comparar. */
  estimadoBrlCentavos: number;
}) {
  const max = Math.max(1, ...dias.map((d) => d.centavosUsd));

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <span className="text-slate-700">
          Real (Anthropic):{" "}
          <strong className="tabular-nums">{formatarUsd(totalCentavosUsd / 100)}</strong>
        </span>
        <span className="text-slate-500">
          Nossa estimativa:{" "}
          <span className="tabular-nums">{formatarMoeda(estimadoBrlCentavos / 100)}</span>
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Moedas diferentes (US$ real × R$ estimado) — serve pra ver a ordem de grandeza e
        ajustar as tarifas se estiver muito fora.
      </p>

      {dias.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">Sem dados de custo no período.</p>
      ) : (
        <div
          className="mt-4 flex h-28 items-end gap-0.5"
          role="img"
          aria-label={`Consumo real de IA por dia nos últimos ${dias.length} dias`}
        >
          {dias.map((d) => (
            <div
              key={d.data}
              title={`${formatarData(d.data)}: ${formatarUsd(d.centavosUsd / 100)}`}
              className="flex-1 rounded-t bg-sky-500/70"
              style={{ height: `${Math.max(2, (d.centavosUsd / max) * 100)}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
