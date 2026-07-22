import { z } from "zod";

// Formato dos webhooks de pagamento do Asaas (docs.asaas.com → Webhooks).
// Campos que não usamos são ignorados pelo Zod (strip padrão).

export const pagamentoAsaasSchema = z.object({
  id: z.string().min(1),
  customer: z.string().min(1),
  value: z.number(),
  status: z.string().min(1),
  dueDate: z.string().nullish(),
  paymentDate: z.string().nullish(),
  clientPaymentDate: z.string().nullish(),
  externalReference: z.string().nullish(),
  description: z.string().nullish(),
});

export const eventoAsaasSchema = z.object({
  // Id único do evento (evt_...) — chave de idempotência.
  id: z.string().min(1),
  // Tipo do evento (PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE...).
  event: z.string().min(1),
  payment: pagamentoAsaasSchema.optional(),
});

// Resposta de GET /customers/{id} da API do Asaas.
export const clienteAsaasSchema = z.object({
  name: z.string().min(1),
  email: z.string().nullish(),
  mobilePhone: z.string().nullish(),
  phone: z.string().nullish(),
});

export type PagamentoAsaas = z.infer<typeof pagamentoAsaasSchema>;
export type EventoAsaas = z.infer<typeof eventoAsaasSchema>;
export type ClienteAsaas = z.infer<typeof clienteAsaasSchema>;
