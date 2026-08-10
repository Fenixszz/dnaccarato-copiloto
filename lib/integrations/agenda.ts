import { obterAccessToken } from "@/lib/integrations/google-auth";
import type { Compromisso } from "@/lib/briefing/priorizar";

/**
 * Client Google Agenda (Calendar) — projeto Google Cloud da Adriana.
 */

const API_BASE = "https://www.googleapis.com/calendar/v3";
const FUSO = "America/Sao_Paulo";

/** Lista eventos de uma agenda (por padrão, a agenda principal). */
export async function listarEventos(
  calendarId = "primary",
  params: Record<string, string> = {},
): Promise<unknown> {
  const token = await obterAccessToken();
  const query = new URLSearchParams(params).toString();
  const resposta = await fetch(
    `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events${query ? `?${query}` : ""}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resposta.ok) {
    throw new Error(`Agenda: falha ao listar eventos (HTTP ${resposta.status}).`);
  }
  return resposta.json();
}

interface EventoCalendar {
  summary?: string;
  start?: { dateTime?: string; date?: string };
}

/** Formata a hora (HH:MM, fuso de SP) do início do evento; "dia todo" se for data. */
function horaDoEvento(start: EventoCalendar["start"]): string {
  if (start?.dateTime) {
    return new Date(start.dateTime).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: FUSO,
    });
  }
  return "dia todo";
}

/**
 * Leitura simples da Google Agenda: os compromissos de HOJE (consulta feita na
 * hora de montar o briefing — não é webhook). Retorna já no formato do briefing.
 */
export async function compromissosDeHoje(
  agora: Date = new Date(),
): Promise<Compromisso[]> {
  const inicio = new Date(agora);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(agora);
  fim.setHours(23, 59, 59, 999);

  const resposta = (await listarEventos("primary", {
    timeMin: inicio.toISOString(),
    timeMax: fim.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
  })) as { items?: EventoCalendar[] };

  return (resposta.items ?? []).map((ev) => ({
    hora: horaDoEvento(ev.start),
    titulo: ev.summary ?? "(sem título)",
  }));
}
