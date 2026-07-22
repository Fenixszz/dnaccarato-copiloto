import { z } from "zod";

// Contrato do webhook de formulários. Quem envia é o NOSSO Google Apps Script
// (scripts/google-forms-webhook.gs) atrelado ao Form — o formato é definido
// por nós dos dois lados.

export const respostaDePerguntaSchema = z.object({
  pergunta: z.string().min(1),
  resposta: z.string(),
});

export const eventoFormsSchema = z.object({
  // Id da resposta no Google Forms — chave de idempotência.
  resposta_id: z.string().min(1),
  formulario_nome: z.string().min(1),
  respondido_em: z.string().min(1),
  // Email da respondente quando o Form coleta email; senão vem null.
  email: z.string().nullish(),
  respostas: z.array(respostaDePerguntaSchema),
});

export type RespostaDePergunta = z.infer<typeof respostaDePerguntaSchema>;
export type EventoForms = z.infer<typeof eventoFormsSchema>;
