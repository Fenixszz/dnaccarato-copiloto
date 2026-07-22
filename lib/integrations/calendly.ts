// Client da API do Calendly (agendamentos). Credenciais: CALENDLY_API_TOKEN
// (veja .env.example).
//
// Limite da API: o Calendly só permite CANCELAR agendamentos por API — criar
// horário novo é sempre pelo link de agendamento, pela convidada.

export async function cancelarAgendamentoCalendly(
  uriDoEvento: string,
  motivo: string
): Promise<void> {
  const token = process.env.CALENDLY_API_TOKEN;
  if (!token) {
    throw new Error("CALENDLY_API_TOKEN não definida (veja .env.example)");
  }
  // A URI vem do banco (referencia_externa); valida o host pra nunca fazer
  // request pra um destino arbitrário.
  if (!uriDoEvento.startsWith("https://api.calendly.com/scheduled_events/")) {
    throw new Error(`URI de agendamento inválida: ${uriDoEvento}`);
  }
  const resposta = await fetch(`${uriDoEvento}/cancellation`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ reason: motivo }),
  });
  if (!resposta.ok) {
    throw new Error(`Calendly retornou HTTP ${resposta.status} ao cancelar o agendamento`);
  }
}
