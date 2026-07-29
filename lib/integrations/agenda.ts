import { obterAccessToken } from "@/lib/integrations/google-auth";

/**
 * Client Google Agenda (Calendar) — projeto Google Cloud da Adriana.
 * Esqueleto para as próximas fases.
 */

const API_BASE = "https://www.googleapis.com/calendar/v3";

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
