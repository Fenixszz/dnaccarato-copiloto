import { optionalEnv, requireEnv } from "@/lib/env";
import { registrarUso } from "@/lib/creditos";
import { estimarCustoAnthropicCentavos, tarifasDoEnv } from "@/lib/creditos/custos";
import {
  ehErroBillingAnthropic,
  alertarBillingAnthropic,
  ErroBillingAnthropic,
} from "@/lib/integrations/anthropic-billing";

/**
 * Integração com a API da Anthropic (backend — a API key NUNCA vai pro client).
 *
 * Usa o conector MCP (beta mcp-client) apontando para o nosso servidor MCP, de
 * forma que a própria Anthropic chama as tools do copiloto ao responder.
 */

const SISTEMA = [
  "Você é o copiloto operacional da Adriana (escritório Adriana Naccarato).",
  "Você responde no WhatsApp: seja curto, direto e cordial, em português do Brasil.",
  "Use as ferramentas do servidor MCP para consultar dados das alunas (status,",
  "pagamentos, documentos, reuniões, formulários, e-mails) e para agir (enviar",
  "lembrete, criar task, remarcar reunião) quando a Adriana pedir.",
  "Se faltar informação, pergunte de forma objetiva. Nunca invente dados.",
].join(" ");

const SISTEMA_WIDGET = [
  "Você é o copiloto operacional da Adriana (escritório Adriana Naccarato), respondendo",
  "por um chat. Seja direto e cordial, em português do Brasil.",
  "Use as ferramentas do servidor MCP para consultar dados das alunas (status,",
  "pagamentos, documentos, reuniões, formulários, e-mails) e para agir (enviar",
  "lembrete, criar task, remarcar reunião) quando pedirem.",
  "Se faltar informação, pergunte de forma objetiva. Nunca invente dados.",
].join(" ");

/** Mensagem do histórico do chat, no vocabulário do app (não da API). */
export interface MensagemChat {
  autor: "usuario" | "assistente";
  texto: string;
}

interface MensagemApi {
  role: "user" | "assistant";
  content: string;
}

/** Converte o histórico do app para o formato de mensagens da API da Anthropic. */
export function paraMensagensApi(mensagens: MensagemChat[]): MensagemApi[] {
  return mensagens.map((m) => ({
    role: m.autor === "usuario" ? "user" : "assistant",
    content: m.texto,
  }));
}

/** URL pública do nosso servidor MCP (a Anthropic precisa alcançá-la). */
function mcpUrl(): string {
  const explicito = optionalEnv("MCP_SERVER_URL");
  if (explicito) return explicito;
  const base = optionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${base}/api/mcp`;
}

interface BlocoConteudo {
  type: string;
  text?: string;
}
interface UsoResposta {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}
interface RespostaAnthropic {
  id?: string;
  content?: BlocoConteudo[];
  usage?: UsoResposta;
}

/**
 * Núcleo da chamada à Anthropic com o conector MCP. A API key e o token do MCP
 * ficam SÓ aqui (servidor) — nunca vão pro client. Trata billing, debita
 * crédito e devolve o texto concatenado. Reaproveitado pelo WhatsApp (uma
 * mensagem) e pelo widget (histórico da conversa).
 */
async function chamarAnthropic(
  messages: MensagemApi[],
  sistema: string,
): Promise<string> {
  const resposta = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": requireEnv("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "mcp-client-2025-04-04",
    },
    body: JSON.stringify({
      model: optionalEnv("ANTHROPIC_MODEL", "claude-opus-4-8"),
      max_tokens: 1024,
      system: sistema,
      messages,
      mcp_servers: [
        {
          type: "url",
          url: mcpUrl(),
          name: "dnaccarato",
          authorization_token: requireEnv("MCP_ANTHROPIC_TOKEN"),
        },
      ],
    }),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text();
    // Erro de billing (saldo/cartão da conta do João) → trata específico:
    // loga alta + avisa o João no WhatsApp (não a Adriana). O copiloto ainda
    // cai no fallback pra ela via o catch de quem chamou.
    if (ehErroBillingAnthropic(resposta.status, detalhe)) {
      await alertarBillingAnthropic(`HTTP ${resposta.status}: ${detalhe.slice(0, 300)}`);
      throw new ErroBillingAnthropic(
        `Anthropic billing recusado (HTTP ${resposta.status}).`,
      );
    }
    throw new Error(`Anthropic: HTTP ${resposta.status}: ${detalhe.slice(0, 300)}`);
  }

  const json = (await resposta.json()) as RespostaAnthropic;

  // Débito de crédito (best-effort — nunca derruba a resposta ao usuário).
  const uso = json.usage ?? {};
  const custo = estimarCustoAnthropicCentavos(
    {
      inputTokens: uso.input_tokens ?? 0,
      outputTokens: uso.output_tokens ?? 0,
      cacheReadTokens: uso.cache_read_input_tokens ?? 0,
      cacheCreationTokens: uso.cache_creation_input_tokens ?? 0,
    },
    tarifasDoEnv(),
  );
  await registrarUso({
    servico: "anthropic",
    valorEstimadoCentavos: custo,
    referencia: json.id ?? null,
  });

  const textos = (json.content ?? [])
    .filter(
      (b): b is Required<BlocoConteudo> =>
        b.type === "text" && typeof b.text === "string",
    )
    .map((b) => b.text);
  return textos.join("\n").trim() || "(sem resposta)";
}

/** Responde a UMA mensagem (usado pelo WhatsApp). */
export async function responderComMcp(texto: string): Promise<string> {
  return chamarAnthropic([{ role: "user", content: texto }], SISTEMA);
}

/**
 * Responde considerando o HISTÓRICO da conversa (usado pelo widget). A lista já
 * deve terminar na última mensagem do usuário.
 */
export async function responderComMcpHistorico(
  mensagens: MensagemChat[],
): Promise<string> {
  return chamarAnthropic(paraMensagensApi(mensagens), SISTEMA_WIDGET);
}
