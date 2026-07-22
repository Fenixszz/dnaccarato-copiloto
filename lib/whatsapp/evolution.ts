// Client da Evolution API (WhatsApp). Credenciais: EVOLUTION_API_URL,
// EVOLUTION_API_TOKEN e EVOLUTION_INSTANCE (veja .env.example).

// A Evolution espera o número só com dígitos e com DDI. Telefone brasileiro
// sem DDI ganha o 55; menos de 10 dígitos (DDD + número) é inválido.
export function formatarNumeroWhatsApp(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) {
    return null;
  }
  if (digitos.startsWith("55") && digitos.length >= 12) {
    return digitos;
  }
  return `55${digitos}`;
}

export async function enviarMensagemWhatsApp(numero: string, texto: string): Promise<void> {
  const url = process.env.EVOLUTION_API_URL;
  const token = process.env.EVOLUTION_API_TOKEN;
  const instancia = process.env.EVOLUTION_INSTANCE;
  if (!url || !token || !instancia) {
    throw new Error(
      "EVOLUTION_API_URL, EVOLUTION_API_TOKEN e EVOLUTION_INSTANCE precisam estar definidas (veja .env.example)"
    );
  }
  const resposta = await fetch(
    `${url.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instancia)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", apikey: token },
      body: JSON.stringify({ number: numero, text: texto }),
    }
  );
  if (!resposta.ok) {
    throw new Error(`Evolution API retornou HTTP ${resposta.status} ao enviar mensagem`);
  }
}
