import Anthropic from "@anthropic-ai/sdk";

// Agente do copiloto: recebe a pergunta da Adriana (via WhatsApp) e responde
// usando a API da Anthropic com o MCP connector apontando pro NOSSO servidor
// MCP (/api/mcp) — a API key nunca sai do backend, e as tools disponíveis
// são exatamente as do escopo do token MCP usado.

const SISTEMA = `Você é o copiloto operacional da clínica Dnaccarato, respondendo à Adriana pelo WhatsApp.

Regras:
- Use as tools do servidor MCP pra consultar os dados reais das alunas. NUNCA invente nomes, números, valores ou status — se a tool não trouxer a informação, diga que não encontrou.
- Responda em português do Brasil, curto e direto, no formato de WhatsApp: frases simples, *negrito* com asterisco quando ajudar, listas com hífen. Nada de markdown pesado (títulos, tabelas).
- Valores em reais no formato R$ 1.234,56 e datas no formato dd/mm.
- Se a pergunta for ambígua entre alunas, pergunte qual delas em vez de chutar.`;

// O loop server-side do MCP pode pausar (pause_turn); reenviamos até um
// limite pra nunca ficar em loop infinito.
const MAXIMO_DE_CONTINUACOES = 5;

export async function perguntarAoCopiloto(pergunta: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const urlDoApp = process.env.APP_URL;
  const tokenMcp = process.env.MCP_TOKEN_COPILOTO;
  if (!apiKey || !urlDoApp || !tokenMcp) {
    throw new Error(
      "ANTHROPIC_API_KEY, APP_URL e MCP_TOKEN_COPILOTO precisam estar definidas (veja .env.example)"
    );
  }

  const cliente = new Anthropic({ apiKey });
  const mensagens: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: pergunta }];

  let resposta = await criarMensagem(cliente, urlDoApp, tokenMcp, mensagens);
  let continuacoes = 0;
  while (resposta.stop_reason === "pause_turn") {
    continuacoes += 1;
    if (continuacoes > MAXIMO_DE_CONTINUACOES) {
      throw new Error("Agente excedeu o limite de continuações (pause_turn)");
    }
    mensagens.push({ role: "assistant", content: resposta.content });
    resposta = await criarMensagem(cliente, urlDoApp, tokenMcp, mensagens);
  }

  const texto = resposta.content
    .filter((bloco): bloco is Anthropic.Beta.BetaTextBlock => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join("\n")
    .trim();

  if (texto === "") {
    throw new Error(`Agente terminou sem texto (stop_reason: ${resposta.stop_reason})`);
  }
  return texto;
}

function criarMensagem(
  cliente: Anthropic,
  urlDoApp: string,
  tokenMcp: string,
  mensagens: Anthropic.Beta.BetaMessageParam[]
) {
  return cliente.beta.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    // "medium" equilibra qualidade e latência — a resposta precisa caber na
    // janela da function serverless (maxDuration da rota).
    output_config: { effort: "medium" },
    betas: ["mcp-client-2025-11-20"],
    mcp_servers: [
      {
        type: "url",
        name: "copiloto",
        url: `${urlDoApp.replace(/\/$/, "")}/api/mcp`,
        authorization_token: tokenMcp,
      },
    ],
    tools: [{ type: "mcp_toolset", mcp_server_name: "copiloto" }],
    system: SISTEMA,
    messages: mensagens,
  });
}
