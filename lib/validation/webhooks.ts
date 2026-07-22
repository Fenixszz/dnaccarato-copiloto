import { z } from "zod";

export const SERVICOS_WEBHOOK = ["asaas", "forms", "calendly", "drive", "whatsapp"] as const;

export const servicoWebhookSchema = z.enum(SERVICOS_WEBHOOK);

export type ServicoWebhook = z.infer<typeof servicoWebhookSchema>;
