import { z } from "zod";

// Formato dos webhooks da Evolution API (evento messages.upsert). Campos que
// não usamos são descartados pelo Zod (strip padrão).

export const mensagemWhatsappSchema = z.object({
  event: z.string().min(1),
  instance: z.string().min(1),
  data: z
    .object({
      key: z.object({
        // Id único da mensagem no WhatsApp — chave de idempotência.
        id: z.string().min(1),
        // Ex.: "5511981246464@s.whatsapp.net"
        remoteJid: z.string().min(1),
        // true = mensagem enviada POR NÓS (eco) — nunca processar.
        fromMe: z.boolean(),
      }),
      pushName: z.string().nullish(),
      message: z
        .object({
          conversation: z.string().nullish(),
          extendedTextMessage: z.object({ text: z.string().nullish() }).nullish(),
        })
        .nullish(),
    })
    .optional(),
});

export type MensagemWhatsapp = z.infer<typeof mensagemWhatsappSchema>;

// Texto da mensagem, nos dois formatos que o WhatsApp usa (mensagem simples
// e mensagem com reply/link). Mídia sem texto retorna null.
export function extrairTextoDaMensagem(evento: MensagemWhatsapp): string | null {
  const mensagem = evento.data?.message;
  const texto = mensagem?.conversation ?? mensagem?.extendedTextMessage?.text ?? null;
  return texto && texto.trim() !== "" ? texto.trim() : null;
}
