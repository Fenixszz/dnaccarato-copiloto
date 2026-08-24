/**
 * Agregação (pura, testável) das métricas do painel inicial a partir das linhas
 * cruas do banco. Nenhum acesso a I/O aqui — o loader (lib/db/queries) busca as
 * linhas e passa pra cá. `valor` de pagamento está em REAIS (decimal), como no
 * resto do app (o dossiê usa `formatarMoeda(p.valor)` direto, sem /100).
 */

export interface PagamentoMetrica {
  status: string;
  valor: number;
  pago_em: string | null;
}

export interface AlunaMetrica {
  criado_em: string;
}

export interface DocumentoMetrica {
  status: string;
}

/** Uma barra da série mensal de recebimentos. */
export interface BarraMes {
  /** Rótulo curto: "jan", "fev"… */
  rotulo: string;
  ano: number;
  /** 1–12. */
  mes: number;
  /** Total recebido no mês (R$). */
  valor: number;
}

export interface MetricasPainel {
  alunasAtivas: number;
  alunasNovas30d: number;
  recebidoMes: number;
  recebidoMesAnterior: number;
  /** Variação % do recebido vs. mês anterior; null se não dá pra comparar. */
  variacaoRecebidoPct: number | null;
  emAberto: number;
  qtdAtrasados: number;
  documentosPendentes: number;
  documentosRejeitados: number;
  /** % de cobranças em dia (pagas / (pagas + atrasadas)); null se não há cobrança. */
  taxaAdimplenciaPct: number | null;
  /** Série dos últimos 6 meses (mais antigo → atual). */
  recebimentoPorMes: BarraMes[];
}

const MESES_PT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** {ano, mes(1–12)} de um ISO no fuso de São Paulo. */
function anoMesSP(iso: string): { ano: number; mes: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  });
  const partes = fmt.formatToParts(new Date(iso));
  const ano = Number(partes.find((p) => p.type === "year")?.value ?? "0");
  const mes = Number(partes.find((p) => p.type === "month")?.value ?? "0");
  return { ano, mes };
}

/** Índice sequencial do mês (ano*12+mes) para comparar/bucketizar. */
function indiceMes(ano: number, mes: number): number {
  return ano * 12 + (mes - 1);
}

export function agregarPainel(
  dados: {
    alunas: AlunaMetrica[];
    pagamentos: PagamentoMetrica[];
    documentos: DocumentoMetrica[];
  },
  agora: Date = new Date(),
): MetricasPainel {
  const { alunas, pagamentos, documentos } = dados;

  // Janela dos últimos 30 dias para "novas alunas".
  const trintaDiasAtras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
  const alunasNovas30d = alunas.filter(
    (a) => new Date(a.criado_em) >= trintaDiasAtras,
  ).length;

  // Mês atual e anterior (em SP).
  const atual = anoMesSP(agora.toISOString());
  const idxAtual = indiceMes(atual.ano, atual.mes);

  // Série dos últimos 6 meses: idxAtual-5 … idxAtual.
  const barras: BarraMes[] = [];
  for (let i = 5; i >= 0; i--) {
    const idx = idxAtual - i;
    const ano = Math.floor(idx / 12);
    const mes = (idx % 12) + 1;
    barras.push({ rotulo: MESES_PT[mes - 1] ?? "", ano, mes, valor: 0 });
  }
  const barraPorIdx = new Map(barras.map((b) => [indiceMes(b.ano, b.mes), b]));

  let recebidoMes = 0;
  let recebidoMesAnterior = 0;
  let pagas = 0;
  let atrasadas = 0;
  let emAberto = 0;

  for (const p of pagamentos) {
    if (p.status === "pago") {
      pagas += 1;
      if (p.pago_em !== null) {
        const { ano, mes } = anoMesSP(p.pago_em);
        const idx = indiceMes(ano, mes);
        const barra = barraPorIdx.get(idx);
        if (barra) barra.valor += p.valor;
        if (idx === idxAtual) recebidoMes += p.valor;
        else if (idx === idxAtual - 1) recebidoMesAnterior += p.valor;
      }
    } else if (p.status === "atrasado") {
      atrasadas += 1;
      emAberto += p.valor;
    }
  }

  const variacaoRecebidoPct =
    recebidoMesAnterior > 0
      ? Math.round(((recebidoMes - recebidoMesAnterior) / recebidoMesAnterior) * 100)
      : null;

  const totalCobrancas = pagas + atrasadas;
  const taxaAdimplenciaPct =
    totalCobrancas > 0 ? Math.round((pagas / totalCobrancas) * 100) : null;

  return {
    alunasAtivas: alunas.length,
    alunasNovas30d,
    recebidoMes,
    recebidoMesAnterior,
    variacaoRecebidoPct,
    emAberto,
    qtdAtrasados: atrasadas,
    documentosPendentes: documentos.filter((d) => d.status === "pendente").length,
    documentosRejeitados: documentos.filter((d) => d.status === "rejeitado").length,
    taxaAdimplenciaPct,
    recebimentoPorMes: barras,
  };
}
