// Saúde do briefing diário: o cron dispara às 10:00 UTC (7h de Brasília). Se
// passar do horário limite sem nenhum registro em briefings_enviados no dia,
// o briefing está atrasado — sinal de que o cron não rodou.

// 11:00 UTC = 8h de Brasília: 1h de folga após o disparo. Antes disso, a
// ausência de registro é esperada ("aguardando"), não uma falha.
export const HORA_LIMITE_BRIEFING_UTC = 11;

export type StatusBriefing = "ok" | "aguardando" | "atrasado" | "desconhecido";

export function avaliarSaudeBriefing(existeBriefingHoje: boolean, agora: Date): StatusBriefing {
  if (existeBriefingHoje) {
    return "ok";
  }
  return agora.getUTCHours() >= HORA_LIMITE_BRIEFING_UTC ? "atrasado" : "aguardando";
}
