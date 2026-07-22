import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { obterSupabase } from "@/lib/db/supabase";
import { montarDossie } from "@/lib/dossie";
import { registrarErroDeRota } from "@/lib/log";
import { detectarFuros } from "@/lib/matching/furos";
import { normalizarNome } from "@/lib/matching/nomes";

// Servidor MCP do copiloto. Cada token de api_tokens carrega um escopo
// (array de nomes de tool); só as tools do escopo são registradas — o
// tools/list de um token mostra apenas o que ele pode chamar, e chamar
// qualquer outra devolve "tool não encontrada" sem vazar que ela existe.
//
// Tools de escrita (fases futuras) DEVEM gravar em log_auditoria com
// origem 'mcp' (regra do projeto). As três abaixo são só de leitura.

export const TOOLS_DISPONIVEIS = ["listar_alunas", "dossie_da_aluna", "detectar_furos"] as const;

function respostaJson(valor: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(valor, null, 2) }] };
}

function respostaDeErro(mensagem: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: mensagem }] };
}

// Erro interno vira mensagem genérica pro cliente MCP; o detalhe fica só no
// log do servidor.
async function comTratamentoDeErro(
  nomeDaTool: string,
  executar: () => Promise<CallToolResult>
): Promise<CallToolResult> {
  try {
    return await executar();
  } catch (erro) {
    registrarErroDeRota({ rota: "/api/mcp", resumo: `tool ${nomeDaTool}` }, erro);
    return respostaDeErro(`Erro interno ao executar a tool ${nomeDaTool}`);
  }
}

export function criarServidorMcp(escopo: string[]): McpServer {
  const servidor = new McpServer({ name: "copiloto-dnaccarato", version: "0.1.0" });
  const permitidas = new Set(escopo);

  if (permitidas.has("listar_alunas")) {
    servidor.registerTool(
      "listar_alunas",
      {
        title: "Listar alunas",
        description:
          "Lista as alunas cadastradas (id, nome, email, telefone), opcionalmente filtrando por nome.",
        inputSchema: {
          busca: z.string().optional().describe("Filtro por nome, ignorando acentos e maiúsculas"),
        },
      },
      ({ busca }) =>
        comTratamentoDeErro("listar_alunas", async () => {
          const { data, error } = await obterSupabase()
            .from("alunas")
            .select("id, nome, email, telefone")
            .order("nome");
          if (error) {
            throw new Error(`Falha ao listar alunas: ${error.message}`);
          }
          const termo = busca ? normalizarNome(busca) : null;
          const alunas = (data ?? []).filter(
            (aluna) => termo === null || normalizarNome(aluna.nome).includes(termo)
          );
          return respostaJson(alunas);
        })
    );
  }

  if (permitidas.has("dossie_da_aluna")) {
    servidor.registerTool(
      "dossie_da_aluna",
      {
        title: "Dossiê da aluna",
        description:
          "Dossiê completo de uma aluna: dados cadastrais, situação de pagamentos, documentos, últimas respostas de formulário, próxima reunião e tasks abertas.",
        inputSchema: {
          aluna_id: z.uuid().describe("Id (UUID) da aluna — use listar_alunas pra descobrir"),
        },
      },
      ({ aluna_id: alunaId }) =>
        comTratamentoDeErro("dossie_da_aluna", async () => {
          const dossie = await montarDossie(alunaId);
          if (dossie === null) {
            return respostaDeErro(`Nenhuma aluna com id ${alunaId}`);
          }
          return respostaJson(dossie);
        })
    );
  }

  if (permitidas.has("detectar_furos")) {
    servidor.registerTool(
      "detectar_furos",
      {
        title: "Detectar furos operacionais",
        description:
          "Sinaliza inconsistências da aluna: pagou sem contrato assinado, assinou sem reunião marcada, formulário sem follow-up, task do Asana parada.",
        inputSchema: {
          aluna_id: z.uuid().describe("Id (UUID) da aluna — use listar_alunas pra descobrir"),
        },
      },
      ({ aluna_id: alunaId }) =>
        comTratamentoDeErro("detectar_furos", async () => {
          const furos = await detectarFuros(alunaId);
          return respostaJson({ aluna_id: alunaId, furos });
        })
    );
  }

  return servidor;
}
