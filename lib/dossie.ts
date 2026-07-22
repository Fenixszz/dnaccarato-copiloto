// Regras de negócio do dossiê da aluna (agregado servido por
// /api/alunas/[id]/dossie).

export type PagamentoDoDossie = {
  id: string;
  status: string;
  valor: number;
  vencimento: string | null;
  pago_em: string | null;
};

// Status que contam como "pago" — cobre os nossos ("pago") e os do Asaas.
const STATUS_PAGOS = new Set(["pago", "received", "confirmed", "received_in_cash"]);

export function pagamentoEstaPago(status: string): boolean {
  return STATUS_PAGOS.has(status.trim().toLowerCase());
}

export type SituacaoDePagamentos = {
  situacao: "em_dia" | "atrasado" | "sem_registros";
  ultimo_pagamento_em: string | null;
  quantidade_em_atraso: number;
  total_em_atraso: number;
};

// Atrasado = não pago com vencimento anterior a hoje. Pendente com
// vencimento futuro é em dia.
export function situacaoDePagamentos(
  pagamentos: PagamentoDoDossie[],
  hoje: Date
): SituacaoDePagamentos {
  if (pagamentos.length === 0) {
    return {
      situacao: "sem_registros",
      ultimo_pagamento_em: null,
      quantidade_em_atraso: 0,
      total_em_atraso: 0,
    };
  }
  const dataDeHoje = hoje.toISOString().slice(0, 10);
  const atrasados = pagamentos.filter(
    (pagamento) =>
      !pagamentoEstaPago(pagamento.status) &&
      pagamento.vencimento !== null &&
      pagamento.vencimento < dataDeHoje
  );
  const datasDePagamento = pagamentos
    .map((pagamento) => pagamento.pago_em)
    .filter((data): data is string => data !== null)
    .sort();
  return {
    situacao: atrasados.length > 0 ? "atrasado" : "em_dia",
    ultimo_pagamento_em: datasDePagamento.at(-1) ?? null,
    quantidade_em_atraso: atrasados.length,
    total_em_atraso: atrasados.reduce((soma, pagamento) => soma + pagamento.valor, 0),
  };
}
