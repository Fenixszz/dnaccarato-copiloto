import { z } from "zod";

/**
 * Schemas Zod de validação de entrada.
 *
 * Regra do projeto (CLAUDE.md): toda rota de API valida o payload com Zod
 * antes de processar qualquer coisa. Estes schemas são propositalmente
 * "permissivos porém seguros" — capturam o essencial (identificador do evento
 * e tipo) e usam `.passthrough()` para não descartar campos que integrações
 * ainda vão consumir. Serão refinados conforme cada integração amadurece.
 */

/** Serviços de webhook suportados na rota /api/webhooks/[servico]. */
export const servicosWebhook = [
  "asaas",
  "autentique",
  "forms",
  "calendly",
  "drive",
  "whatsapp",
] as const;

export const servicoWebhookSchema = z.enum(servicosWebhook);
export type ServicoWebhook = z.infer<typeof servicoWebhookSchema>;

// -----------------------------------------------------------------------------
// Asaas — https://docs.asaas.com/docs/webhooks
// -----------------------------------------------------------------------------
export const asaasWebhookSchema = z
  .object({
    id: z.string().min(1).optional(),
    event: z.string().min(1),
    payment: z.record(z.unknown()).optional(),
  })
  .passthrough();
export type AsaasWebhook = z.infer<typeof asaasWebhookSchema>;

// -----------------------------------------------------------------------------
// Autentique — eventos de assinatura de documento
// -----------------------------------------------------------------------------
export const autentiqueWebhookSchema = z
  .object({
    event: z.object({ type: z.string().min(1) }).passthrough(),
    document: z.record(z.unknown()).optional(),
  })
  .passthrough();
export type AutentiqueWebhook = z.infer<typeof autentiqueWebhookSchema>;

// -----------------------------------------------------------------------------
// Calendly — https://developer.calendly.com/api-docs (webhook payload)
// -----------------------------------------------------------------------------
export const calendlyWebhookSchema = z
  .object({
    event: z.string().min(1),
    payload: z.record(z.unknown()),
  })
  .passthrough();
export type CalendlyWebhook = z.infer<typeof calendlyWebhookSchema>;

// -----------------------------------------------------------------------------
// Google Forms — respostas encaminhadas (via Apps Script / integração)
// -----------------------------------------------------------------------------
export const formsWebhookSchema = z
  .object({
    formId: z.string().min(1),
    responseId: z.string().min(1),
    respostas: z.record(z.unknown()).optional(),
  })
  .passthrough();
export type FormsWebhook = z.infer<typeof formsWebhookSchema>;

// -----------------------------------------------------------------------------
// Google Drive — notificações de mudança (push notifications)
// -----------------------------------------------------------------------------
export const driveWebhookSchema = z
  .object({
    resourceId: z.string().min(1),
    resourceState: z.string().min(1),
  })
  .passthrough();
export type DriveWebhook = z.infer<typeof driveWebhookSchema>;

// -----------------------------------------------------------------------------
// WhatsApp (Evolution API) — eventos de mensagem
// -----------------------------------------------------------------------------
export const whatsappWebhookSchema = z
  .object({
    event: z.string().min(1),
    instance: z.string().min(1).optional(),
    data: z.record(z.unknown()).optional(),
  })
  .passthrough();
export type WhatsappWebhook = z.infer<typeof whatsappWebhookSchema>;

/** Mapa de schema por serviço, para lookup dinâmico na rota genérica. */
export const schemaPorServico: Record<ServicoWebhook, z.ZodTypeAny> = {
  asaas: asaasWebhookSchema,
  autentique: autentiqueWebhookSchema,
  forms: formsWebhookSchema,
  calendly: calendlyWebhookSchema,
  drive: driveWebhookSchema,
  whatsapp: whatsappWebhookSchema,
};

/**
 * Extrai um identificador externo único do evento, por serviço, para dedupe.
 * Retorna `null` quando não é possível determinar um id estável.
 */
export function extrairIdExterno(
  servico: ServicoWebhook,
  payload: Record<string, unknown>,
): string | null {
  switch (servico) {
    case "asaas": {
      const id = payload["id"];
      return typeof id === "string" ? id : null;
    }
    case "calendly": {
      const p = payload["payload"];
      const uri =
        p && typeof p === "object" ? (p as Record<string, unknown>)["uri"] : undefined;
      return typeof uri === "string" ? uri : null;
    }
    case "forms": {
      const id = payload["responseId"];
      return typeof id === "string" ? id : null;
    }
    case "drive": {
      const id = payload["resourceId"];
      const state = payload["resourceState"];
      return typeof id === "string" && typeof state === "string"
        ? `${id}:${state}`
        : null;
    }
    case "autentique": {
      const doc = payload["document"];
      const id =
        doc && typeof doc === "object"
          ? (doc as Record<string, unknown>)["id"]
          : undefined;
      return typeof id === "string" ? id : null;
    }
    case "whatsapp": {
      const data = payload["data"];
      const key =
        data && typeof data === "object"
          ? (data as Record<string, unknown>)["key"]
          : undefined;
      const id =
        key && typeof key === "object"
          ? (key as Record<string, unknown>)["id"]
          : undefined;
      return typeof id === "string" ? id : null;
    }
    default:
      return null;
  }
}
