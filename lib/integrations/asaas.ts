import { clienteAsaasSchema, type ClienteAsaas } from "@/lib/validation/asaas";

// Client da API do Asaas (cobranças e pagamentos).
// Credenciais: ASAAS_API_KEY e ASAAS_BASE_URL (veja .env.example).

function configuracaoAsaas(): { baseUrl: string; apiKey: string } {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    throw new Error("ASAAS_API_KEY não definida (veja .env.example)");
  }
  const baseUrl = process.env.ASAAS_BASE_URL ?? "https://api.asaas.com/v3";
  return { baseUrl, apiKey };
}

// Busca os dados de contato de um cliente (o webhook de pagamento só traz o
// id do customer; email/telefone vêm daqui pra fazer o matching com alunas).
export async function buscarClienteAsaas(clienteId: string): Promise<ClienteAsaas> {
  const { baseUrl, apiKey } = configuracaoAsaas();
  const resposta = await fetch(`${baseUrl}/customers/${encodeURIComponent(clienteId)}`, {
    headers: { access_token: apiKey, accept: "application/json" },
  });
  if (!resposta.ok) {
    throw new Error(`Asaas retornou HTTP ${resposta.status} ao buscar cliente ${clienteId}`);
  }
  const corpo: unknown = await resposta.json();
  const cliente = clienteAsaasSchema.safeParse(corpo);
  if (!cliente.success) {
    throw new Error(`Resposta inesperada do Asaas ao buscar cliente ${clienteId}`);
  }
  return cliente.data;
}
