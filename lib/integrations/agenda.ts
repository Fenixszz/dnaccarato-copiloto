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

/** Um evento futuro da agenda, normalizado para a lista de reuniões da home. */
export interface EventoAgenda {
  id: string;
  titulo: string;
  /** Início em ISO (só eventos COM horário — "dia todo" é descartado). */
  inicioIso: string;
}

interface EventoCalendarBruto {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
}

/**
 * Próximos eventos COM horário da agenda principal (janela de `dias` dias, até
 * `max` eventos), para compor a lista "Próximas reuniões" do dashboard junto
 * com as reuniões do Calendly. Eventos "dia todo" (só `date`, sem `dateTime`)
 * são descartados — são marcadores (ex.: "Home"), não reuniões.
 */
export async function proximosEventosAgenda(
  dias = 14,
  max = 15,
  agora: Date = new Date(),
): Promise<EventoAgenda[]> {
  const fim = new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000);

  const resposta = (await listarEventos("primary", {
    timeMin: agora.toISOString(),
    timeMax: fim.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(max),
  })) as { items?: EventoCalendarBruto[] };

  return (resposta.items ?? [])
    .filter((ev): ev is EventoCalendarBruto & { start: { dateTime: string } } =>
      Boolean(ev.start?.dateTime),
    )
    .map((ev) => ({
      id: ev.id ?? `agenda-${ev.start.dateTime}`,
      titulo: ev.summary ?? "(sem título)",
      inicioIso: ev.start.dateTime,
    }));
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

/**
 * Próximas reuniões (COM horário) dos próximos `dias` dias — para o briefing do
 * WhatsApp bater com a lista "Próximas reuniões" do site (antes o briefing só
 * mostrava HOJE, então reuniões futuras apareciam no site e não no WhatsApp).
 * Cada `hora` vem como "DD/MM HH:MM" (fuso SP), já que agora é multi-dia.
 */
export async function proximosCompromissos(
  dias = 7,
  max = 6,
  agora: Date = new Date(),
): Promise<Compromisso[]> {
  const eventos = await proximosEventosAgenda(dias, 20, agora);
  return eventos.slice(0, max).map((ev) => {
    const d = new Date(ev.inicioIso);
    const dia = d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      timeZone: FUSO,
    });
    const hora = d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: FUSO,
    });
    return { hora: `${dia} ${hora}`, titulo: ev.titulo };
  });
}
