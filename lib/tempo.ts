/**
 * Utilitários de tempo no fuso da Adriana (America/Sao_Paulo).
 */

const FUSO = "America/Sao_Paulo";
const DIA_MS = 24 * 60 * 60 * 1000;

/** Hora atual (0–23) em São Paulo. */
export function horaEmSaoPaulo(agora: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    hour: "2-digit",
    hour12: false,
  });
  return Number.parseInt(fmt.format(agora), 10);
}

/** Data-calendário (YYYY-MM-DD) de um instante, no fuso de São Paulo. */
function dataSPDe(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante); // "YYYY-MM-DD"
}

/**
 * Instante (ISO) do início do dia de HOJE em São Paulo. SP é UTC-3 fixo (sem
 * horário de verão desde 2019), então usamos o offset -03:00.
 */
export function inicioDeHojeSP(agora: Date = new Date()): string {
  return `${dataSPDe(agora)}T00:00:00-03:00`;
}

/**
 * Intervalo [inicio, fim) da SEMANA de hoje em São Paulo: da segunda-feira
 * 00:00 até a segunda-feira seguinte 00:00, como instantes ISO com offset
 * -03:00. Use com `>= inicio` e `< fim` para pegar tudo da semana corrente.
 */
export function intervaloSemanaSP(agora: Date = new Date()): {
  inicio: string;
  fim: string;
} {
  // Meia-noite de hoje em SP como instante (ex.: 2026-08-12T00:00:00-03:00,
  // que é 2026-08-12T03:00:00Z) — o dia UTC coincide com o dia SP.
  const hoje = new Date(inicioDeHojeSP(agora));
  // getUTCDay: 0=domingo … 6=sábado. Segunda-feira como início da semana.
  const desdeSegunda = (hoje.getUTCDay() + 6) % 7;
  const inicioInstante = new Date(hoje.getTime() - desdeSegunda * DIA_MS);
  const fimInstante = new Date(inicioInstante.getTime() + 7 * DIA_MS);
  return {
    inicio: `${dataSPDe(inicioInstante)}T00:00:00-03:00`,
    fim: `${dataSPDe(fimInstante)}T00:00:00-03:00`,
  };
}
