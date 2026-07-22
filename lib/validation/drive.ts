import { z } from "zod";

// A notificação push do Drive não tem corpo — a informação vem nos headers
// X-Goog-* (developers.google.com/drive → push notifications). A rota monta
// este objeto a partir deles e valida aqui.
export const notificacaoDriveSchema = z.object({
  canal_id: z.string().min(1),
  // sync (handshake na criação do canal), add, remove, update, trash, change...
  estado: z.string().min(1),
  // Sequencial por canal — compõe a chave de idempotência.
  numero_mensagem: z.string().min(1),
  recurso_id: z.string().nullish(),
});

export const arquivoDriveSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  modifiedTime: z.string().nullish(),
  webViewLink: z.string().nullish(),
});

export const listaArquivosDriveSchema = z.object({
  files: z.array(arquivoDriveSchema),
});

export type NotificacaoDrive = z.infer<typeof notificacaoDriveSchema>;
export type ArquivoDrive = z.infer<typeof arquivoDriveSchema>;
