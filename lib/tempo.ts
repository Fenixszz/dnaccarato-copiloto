/**
 * Utilitários de tempo no fuso da Adriana (America/Sao_Paulo).
 */

const FUSO = "America/Sao_Paulo";

/** Hora atual (0–23) em São Paulo. */
export function horaEmSaoPaulo(agora: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    hour: "2-digit",
    hour12: false,
  });
  return Number.parseInt(fmt.format(agora), 10);
}

/**
 * Instante (ISO) do início do dia de HOJE em São Paulo. SP é UTC-3 fixo (sem
 * horário de verão desde 2019), então usamos o offset -03:00.
 */
export function inicioDeHojeSP(agora: Date = new Date()): string {
  const dataSP = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora); // "YYYY-MM-DD"
  return `${dataSP}T00:00:00-03:00`;
}
