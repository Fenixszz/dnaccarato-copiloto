import { dormir } from "@/lib/dormir";
import { registrarFalha } from "@/lib/falhas";
import { enviarMensagemWhatsApp } from "@/lib/whatsapp/evolution";

// Envio confiável pela Evolution API: até 3 tentativas com backoff
// exponencial. Se todas falharem, registra em falhas_sistema (log crítico +
// tabela) e relança — o chamador trata como erro (500, sem marcar
// processado). Usado pelo briefing diário e pelo webhook de resposta.

export const MAX_TENTATIVAS_ENVIO = 3;
const BASE_BACKOFF_MS = 500;

export type ContextoDeEnvio = {
  // Onde o envio ocorre: 'briefing' | 'whatsapp'.
  area: string;
  // O que está sendo enviado (sem dado sensível) — vai pra falhas_sistema.
  contexto: string;
};

export async function enviarComRetry(
  numero: string,
  texto: string,
  contexto: ContextoDeEnvio
): Promise<void> {
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_ENVIO; tentativa += 1) {
    try {
      await enviarMensagemWhatsApp(numero, texto);
      return;
    } catch (erro) {
      ultimoErro = erro;
      if (tentativa < MAX_TENTATIVAS_ENVIO) {
        await dormir(BASE_BACKOFF_MS * 2 ** (tentativa - 1));
      }
    }
  }

  await registrarFalha(
    contexto.area,
    `${contexto.contexto}: envio falhou após ${MAX_TENTATIVAS_ENVIO} tentativas`,
    ultimoErro
  );
  throw new Error(
    `Falha ao enviar pela Evolution após ${MAX_TENTATIVAS_ENVIO} tentativas: ${
      ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)
    }`
  );
}
