/**
 * Combinação das "próximas reuniões" da home a partir de DUAS fontes:
 *   - `reunioes` (tabela) → reuniões de aluna vindas do Calendly (têm nome);
 *   - Google Agenda → compromissos com horário da agenda da Adriana.
 *
 * Regras (puras e testadas): ordena por horário; deduplica quando o MESMO
 * instante aparece nas duas fontes (o Calendly sincroniza pro Google Agenda),
 * preferindo a entrada do Calendly (que traz o nome da aluna); conta quantas
 * caem na semana corrente; e corta a lista exibida em `limite`.
 */

export type FonteReuniao = "calendly" | "agenda";

export interface ReuniaoUnificada {
  id: string;
  data_hora: string;
  /** Nome da aluna (Calendly) ou título do evento (Agenda). */
  titulo: string;
  fonte: FonteReuniao;
}

/** Chave de deduplicação: mesmo minuto de início. */
function chaveMinuto(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return String(Math.floor(ms / 60000));
}

export interface ResultadoProximas {
  proximas: ReuniaoUnificada[];
  totalSemana: number;
}

/**
 * Junta as duas fontes, deduplica por instante (preferindo Calendly), ordena
 * por horário, conta as da semana e corta em `limite`.
 *
 * @param itens todas as reuniões futuras já normalizadas (das duas fontes)
 * @param janelaSemana intervalo [inicio, fim) da semana corrente (ISO, fuso SP)
 */
export function combinarProximasReunioes(
  itens: ReuniaoUnificada[],
  janelaSemana: { inicio: string; fim: string },
  limite = 8,
): ResultadoProximas {
  // Dedup por minuto de início, preferindo o Calendly.
  const porChave = new Map<string, ReuniaoUnificada>();
  for (const item of itens) {
    const chave = chaveMinuto(item.data_hora);
    const existente = porChave.get(chave);
    if (existente === undefined) {
      porChave.set(chave, item);
    } else if (existente.fonte === "agenda" && item.fonte === "calendly") {
      porChave.set(chave, item); // Calendly ganha do evento espelhado da Agenda
    }
  }

  const ordenados = [...porChave.values()].sort(
    (a, b) => Date.parse(a.data_hora) - Date.parse(b.data_hora),
  );

  const inicio = Date.parse(janelaSemana.inicio);
  const fim = Date.parse(janelaSemana.fim);
  const totalSemana = ordenados.filter((r) => {
    const t = Date.parse(r.data_hora);
    return t >= inicio && t < fim;
  }).length;

  return { proximas: ordenados.slice(0, limite), totalSemana };
}
