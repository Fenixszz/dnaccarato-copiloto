/**
 * Consulta OPCIONAL ao Admin API da Anthropic (Cost Report) — só pro João
 * conferir se o custo estimado bate com o real.
 *
 * Requer ANTHROPIC_ADMIN_API_KEY (chave de admin da organização, sk-ant-admin…).
 * Se a chave não estiver configurada, devolve `indisponivel` e a tela esconde a
 * seção. Qualquer falha vira `erro` (a tela mostra um aviso curto) — nunca
 * derruba a página de créditos.
 *
 * Endpoint: GET https://api.anthropic.com/v1/organizations/cost_report
 * `amount` vem em centavos de USD como string decimal ("123.45" = US$ 1,2345).
 */
import { optionalEnv } from "@/lib/env";

const COST_REPORT_URL = "https://api.anthropic.com/v1/organizations/cost_report";

export interface DiaCustoReal {
  /** Data (YYYY-MM-DD, UTC) do bucket. */
  data: string;
  /** Custo real do dia em centavos de USD. */
  centavosUsd: number;
}

export type ConsumoReal =
  | { estado: "indisponivel" }
  | { estado: "erro" }
  | { estado: "ok"; dias: DiaCustoReal[]; totalCentavosUsd: number };

interface ResultadoCusto {
  amount?: string;
}
interface BucketCusto {
  starting_at?: string;
  results?: ResultadoCusto[];
}
interface RespostaCostReport {
  data?: BucketCusto[];
}

/**
 * Custo real da Anthropic por dia nos últimos `dias` dias (bucket diário).
 * Sem group_by → cada bucket traz o total do dia (soma dos `results`).
 */
export async function custoRealAnthropicPorDia(
  dias = 30,
  agora: Date = new Date(),
): Promise<ConsumoReal> {
  const adminKey = optionalEnv("ANTHROPIC_ADMIN_API_KEY");
  if (!adminKey) return { estado: "indisponivel" };

  try {
    const inicio = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);
    const url = new URL(COST_REPORT_URL);
    url.searchParams.set("starting_at", inicio.toISOString());
    url.searchParams.set("bucket_width", "1d");
    url.searchParams.set("limit", String(dias + 1));

    const resposta = await fetch(url, {
      headers: {
        "x-api-key": adminKey,
        "anthropic-version": "2023-06-01",
      },
      cache: "no-store",
    });
    if (!resposta.ok) return { estado: "erro" };

    const json = (await resposta.json()) as RespostaCostReport;
    const porDia: DiaCustoReal[] = (json.data ?? []).map((bucket) => {
      const centavosUsd = (bucket.results ?? []).reduce((soma, r) => {
        const v = Number.parseFloat(r.amount ?? "0");
        return soma + (Number.isFinite(v) ? v : 0);
      }, 0);
      return { data: (bucket.starting_at ?? "").slice(0, 10), centavosUsd };
    });

    const totalCentavosUsd = porDia.reduce((s, d) => s + d.centavosUsd, 0);
    return { estado: "ok", dias: porDia, totalCentavosUsd };
  } catch {
    return { estado: "erro" };
  }
}
