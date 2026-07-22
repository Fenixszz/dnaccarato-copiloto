import { z } from "zod";

// Formato dos webhooks v2 do Calendly (developer.calendly.com → Webhooks).
// Tratamos invitee.created e invitee.canceled; campos não usados são
// descartados pelo Zod (strip padrão).

export const eventoAgendadoCalendlySchema = z.object({
  // URI única do scheduled_event — vira a referencia_externa da reunião.
  uri: z.string().min(1),
  name: z.string().nullish(),
  start_time: z.string().min(1),
  location: z
    .object({
      join_url: z.string().nullish(),
    })
    .nullish(),
});

export const convidadaCalendlySchema = z.object({
  // URI única do invitee — compõe a chave de idempotência.
  uri: z.string().min(1),
  name: z.string().min(1),
  email: z.string().nullish(),
  // Telefone informado pra lembrete por SMS, quando a agenda pede.
  text_reminder_number: z.string().nullish(),
  scheduled_event: eventoAgendadoCalendlySchema,
});

export const eventoCalendlySchema = z.object({
  event: z.string().min(1),
  payload: convidadaCalendlySchema.optional(),
});

export const EVENTOS_CALENDLY_TRATADOS = ["invitee.created", "invitee.canceled"] as const;

export type EventoCalendly = z.infer<typeof eventoCalendlySchema>;
export type ConvidadaCalendly = z.infer<typeof convidadaCalendlySchema>;
