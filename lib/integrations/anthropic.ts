import { optionalEnv, requireEnv } from "@/lib/env";

/**
 * Integração com a API da Anthropic (backend — a API key NUNCA vai pro client).
 *
 * Usa o conector MCP (beta mcp-client) apontando para o nosso servidor MCP, de
 * forma que a própria Anthropic chama as tools do copiloto ao responder.
 */

const SISTEMA = [
  "Você é o copiloto operacional da Adriana (escritório Dnaccarato).",
  "Você responde no WhatsApp: seja curto, direto e cordial, em português do Brasil.",
  "Use as ferramentas do servidor MCP para consultar dados das alunas (status,",
  "pagamentos, documentos, reuniões, formulários, e-mails) e para agir (enviar",
  "lembrete, criar task, remarcar reunião) quando a Adriana pedir.",
  "Se faltar informação, pergunte de forma objetiva. Nunca invente dados.",
].join(" ");

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
interface RespostaAnthropic {
  content?: BlocoConteudo[];
}

/**
 * Manda o texto para a Anthropic com o conector MCP e devolve a resposta em
 * texto (concatenando os blocos de texto da resposta).
 */
export async function responderComMcp(texto: string): Promise<string> {
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
      system: SISTEMA,
      messages: [{ role: "user", content: texto }],
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
    throw new Error(`Anthropic: HTTP ${resposta.status}: ${detalhe.slice(0, 300)}`);
  }

  const json = (await resposta.json()) as RespostaAnthropic;
  const textos = (json.content ?? [])
    .filter(
      (b): b is Required<BlocoConteudo> =>
        b.type === "text" && typeof b.text === "string",
    )
    .map((b) => b.text);
  return textos.join("\n").trim() || "(sem resposta)";
}
