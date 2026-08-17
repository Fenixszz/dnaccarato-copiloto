/**
 * Formatação para exibição (pt-BR, fuso de São Paulo). Formatadores criados
 * uma vez no módulo (reuso barato entre renders).
 */

const FUSO = "America/Sao_Paulo";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const MOEDA_USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short" });
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  dateStyle: "short",
  timeStyle: "short",
});

/** Valor numérico em reais (ex.: 500 → "R$ 500,00"). */
export function formatarMoeda(valor: number): string {
  return MOEDA.format(valor);
}

/** Valor numérico em dólares (ex.: 1.23 → "$1.23"). */
export function formatarUsd(valor: number): string {
  return MOEDA_USD.format(valor);
}

/** Data ISO → "dd/mm/aaaa" em SP; traço quando ausente/inválida. */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "—" : DATA.format(ms);
}

/** Data/hora ISO → "dd/mm/aaaa, hh:mm" em SP; traço quando ausente/inválida. */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "—" : DATA_HORA.format(ms);
}
