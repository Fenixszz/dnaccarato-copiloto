import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  acaoCriarTaskAsana,
  acaoEnviarLembretePagamento,
  acaoRemarcarReuniao,
} from "@/lib/acoes/escrita";
import { executarComAuditoria } from "@/lib/acoes/executar";
import { obterSupabase } from "@/lib/db/supabase";
import { montarDossie, pagamentoEstaPago } from "@/lib/dossie";
import { registrarErroDeRota } from "@/lib/log";
import { detectarFuros } from "@/lib/matching/furos";
import { tokensDeNome } from "@/lib/matching/matcher";
import { normalizarNome } from "@/lib/matching/nomes";
import type { TokenMcp } from "@/lib/mcp/autenticacao";

// Servidor MCP do copiloto. Cada token de api_tokens carrega um escopo
// (array de nomes de tool); só as tools do escopo são registradas — o
// tools/list de um token mostra apenas o que ele pode chamar, e chamar
// qualquer outra devolve "tool não encontrada" sem vazar que ela existe.
//
// Toda tool de ESCRITA passa pelo wrapper comAuditoria: grava em
// log_auditoria (origem 'mcp') quem chamou, o quê e o resultado — sucesso,
// recusa ou erro. Nenhuma escrita executa sem esse rastro (regra do projeto).

export const TOOLS_DISPONIVEIS = [
  "listar_alunas",
  "dossie_da_aluna",
  "detectar_furos",
  "status_aluna",
  "pagamentos_pendentes",
  "documentos_nao_assinados",
  "proxima_reuniao",
  "buscar_formulario",
  "enviar_lembrete_pagamento",
  "criar_task_asana",
  "remarcar_reuniao",
] as const;

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

// Resolução de aluna POR NOME pras tools de leitura: todos os tokens da
// busca (sem acento/caixa/conectivos) precisam estar no nome da aluna —
// "Beatriz" acha "Beatriz Lima". Menos estrito que o matcher de escrita
// (lib/matching/matcher.ts) de propósito: leitura errada é visível e
// inofensiva; ambiguidade nunca chuta, lista as candidatas.
type ResolucaoDeAluna =
  | { resultado: "encontrada"; aluna: { id: string; nome: string } }
  | { resultado: "nao_encontrada" }
  | { resultado: "ambigua"; candidatas: string[] };

function nomeCorrespondeABusca(nomeAluna: string, busca: string): boolean {
  const tokensBusca = tokensDeNome(busca);
  if (tokensBusca.length === 0) {
    return false;
  }
  const tokensAluna = tokensDeNome(nomeAluna);
  return tokensBusca.every((token) => tokensAluna.includes(token));
}

async function resolverAlunaPorNome(nome: string): Promise<ResolucaoDeAluna> {
  const { data, error } = await obterSupabase().from("alunas").select("id, nome").order("nome");
  if (error) {
    throw new Error(`Falha ao listar alunas: ${error.message}`);
  }
  const candidatas = (data ?? []).filter((aluna) => nomeCorrespondeABusca(aluna.nome, nome));
  if (candidatas.length === 1) {
    return { resultado: "encontrada", aluna: candidatas[0] };
  }
  if (candidatas.length === 0) {
    return { resultado: "nao_encontrada" };
  }
  return { resultado: "ambigua", candidatas: candidatas.map((candidata) => candidata.nome) };
}

function respostaDeAlunaNaoResolvida(nome: string, resolucao: ResolucaoDeAluna): CallToolResult {
  if (resolucao.resultado === "ambigua") {
    return respostaDeErro(
      `Mais de uma aluna corresponde a "${nome}": ${resolucao.candidatas.join(", ")}. Repita com o nome mais completo.`
    );
  }
  return respostaDeErro(
    `Nenhuma aluna encontrada com o nome "${nome}". Use listar_alunas pra ver os nomes cadastrados.`
  );
}

// TODA tool de escrita passa por aqui: delega pro executor compartilhado
// (que executa + audita como ator MCP) e traduz o desfecho pra resposta do
// protocolo MCP. Mesma lógica de ação usada pelos botões do dashboard.
function comAuditoria(
  token: TokenMcp,
  acao: string,
  alunaId: string | null,
  nucleo: () => Promise<import("@/lib/acoes/escrita").ResultadoEscrita>
): Promise<CallToolResult> {
  return (async () => {
    const desfecho = await executarComAuditoria(
      { origem: "mcp", tokenId: token.id, tokenNome: token.nome },
      acao,
      alunaId,
      nucleo
    );
    switch (desfecho.status) {
      case "ok":
        return respostaJson(desfecho.dados);
      case "recusado":
        return respostaDeErro(desfecho.mensagem);
      case "erro":
        return respostaDeErro(`Erro interno ao executar a tool ${acao}`);
      case "sem_auditoria":
        return respostaDeErro(
          `A tool ${acao} não pôde registrar a auditoria — a ação pode ter sido executada; verifique os logs antes de repetir.`
        );
    }
  })();
}

export function criarServidorMcp(token: TokenMcp): McpServer {
  const servidor = new McpServer({ name: "copiloto-dnaccarato", version: "0.1.0" });
  const permitidas = new Set(token.escopo);

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
          "Sinaliza inconsistências da aluna: pagamento atrasado, pagou sem contrato assinado, assinou sem reunião marcada, formulário sem follow-up, task do Asana parada.",
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

  if (permitidas.has("status_aluna")) {
    servidor.registerTool(
      "status_aluna",
      {
        title: "Status da aluna",
        description:
          "Dossiê agregado de uma aluna buscada pelo NOME: cadastro, pagamentos, documentos, formulários, próxima reunião e tasks abertas.",
        inputSchema: {
          nome: z.string().min(2).describe("Nome (ou parte do nome) da aluna"),
        },
      },
      ({ nome }) =>
        comTratamentoDeErro("status_aluna", async () => {
          const resolucao = await resolverAlunaPorNome(nome);
          if (resolucao.resultado !== "encontrada") {
            return respostaDeAlunaNaoResolvida(nome, resolucao);
          }
          const dossie = await montarDossie(resolucao.aluna.id);
          if (dossie === null) {
            return respostaDeErro(`Nenhuma aluna encontrada com o nome "${nome}".`);
          }
          return respostaJson(dossie);
        })
    );
  }

  if (permitidas.has("pagamentos_pendentes")) {
    servidor.registerTool(
      "pagamentos_pendentes",
      {
        title: "Pagamentos pendentes",
        description:
          "Lista as alunas com pagamento atrasado (não pago e vencido), com valores e vencimentos.",
        inputSchema: {},
      },
      () =>
        comTratamentoDeErro("pagamentos_pendentes", async () => {
          const hoje = new Date().toISOString().slice(0, 10);
          const { data, error } = await obterSupabase()
            .from("pagamentos")
            .select("status, valor, vencimento, alunas ( id, nome )")
            .lt("vencimento", hoje)
            .order("vencimento", { ascending: true });
          if (error) {
            throw new Error(`Falha ao listar pagamentos: ${error.message}`);
          }
          const atrasados = (data ?? []).filter(
            (pagamento) => !pagamentoEstaPago(pagamento.status)
          );
          const porAluna = new Map<
            string,
            {
              aluna: string;
              pagamentos: Array<{ valor: number; vencimento: string | null; status: string }>;
              total_em_atraso: number;
            }
          >();
          for (const pagamento of atrasados) {
            const chave = pagamento.alunas?.id ?? "sem_aluna_vinculada";
            const nomeAluna = pagamento.alunas?.nome ?? "(sem aluna vinculada)";
            const grupo = porAluna.get(chave) ?? {
              aluna: nomeAluna,
              pagamentos: [],
              total_em_atraso: 0,
            };
            grupo.pagamentos.push({
              valor: pagamento.valor,
              vencimento: pagamento.vencimento,
              status: pagamento.status,
            });
            grupo.total_em_atraso += pagamento.valor;
            porAluna.set(chave, grupo);
          }
          return respostaJson([...porAluna.values()]);
        })
    );
  }

  if (permitidas.has("documentos_nao_assinados")) {
    servidor.registerTool(
      "documentos_nao_assinados",
      {
        title: "Documentos não assinados",
        description: "Lista as pendências de assinatura: documento, aluna e link no Drive.",
        inputSchema: {},
      },
      () =>
        comTratamentoDeErro("documentos_nao_assinados", async () => {
          const { data, error } = await obterSupabase()
            .from("documentos")
            .select("tipo, link_drive, criado_em, alunas ( id, nome )")
            .eq("status", "pendente")
            .order("criado_em", { ascending: true });
          if (error) {
            throw new Error(`Falha ao listar documentos: ${error.message}`);
          }
          const pendencias = (data ?? []).map((documento) => ({
            aluna: documento.alunas?.nome ?? "(sem aluna vinculada)",
            tipo: documento.tipo,
            pendente_desde: documento.criado_em,
            link_drive: documento.link_drive,
          }));
          return respostaJson(pendencias);
        })
    );
  }

  if (permitidas.has("proxima_reuniao")) {
    servidor.registerTool(
      "proxima_reuniao",
      {
        title: "Próxima reunião",
        description: "Próxima reunião futura (não cancelada) de uma aluna buscada pelo nome.",
        inputSchema: {
          nome: z.string().min(2).describe("Nome (ou parte do nome) da aluna"),
        },
      },
      ({ nome }) =>
        comTratamentoDeErro("proxima_reuniao", async () => {
          const resolucao = await resolverAlunaPorNome(nome);
          if (resolucao.resultado !== "encontrada") {
            return respostaDeAlunaNaoResolvida(nome, resolucao);
          }
          const { data, error } = await obterSupabase()
            .from("reunioes")
            .select("data_hora, status, origem, link")
            .eq("aluna_id", resolucao.aluna.id)
            .gte("data_hora", new Date().toISOString())
            .neq("status", "cancelada")
            .order("data_hora", { ascending: true })
            .limit(1);
          if (error) {
            throw new Error(`Falha ao buscar reuniões: ${error.message}`);
          }
          const proxima = (data ?? [])[0];
          if (!proxima) {
            return respostaJson({
              aluna: resolucao.aluna.nome,
              proxima_reuniao: null,
              aviso: "Nenhuma reunião futura marcada pra essa aluna.",
            });
          }
          return respostaJson({ aluna: resolucao.aluna.nome, proxima_reuniao: proxima });
        })
    );
  }

  if (permitidas.has("buscar_formulario")) {
    servidor.registerTool(
      "buscar_formulario",
      {
        title: "Buscar em formulários",
        description:
          "Busca um termo nas respostas de formulário (perguntas e respostas), ignorando acentos e maiúsculas. Retorna as 10 respostas mais recentes que contêm o termo.",
        inputSchema: {
          query: z.string().min(2).describe("Termo a procurar nas perguntas e respostas"),
        },
      },
      ({ query }) =>
        comTratamentoDeErro("buscar_formulario", async () => {
          const { data, error } = await obterSupabase()
            .from("formularios")
            .select("id, formulario_nome, respostas, respondido_em, alunas ( id, nome )")
            .order("respondido_em", { ascending: false })
            .limit(200);
          if (error) {
            throw new Error(`Falha ao buscar formulários: ${error.message}`);
          }
          const termo = normalizarNome(query);
          const encontrados = (data ?? [])
            .filter((formulario) =>
              normalizarNome(
                `${formulario.formulario_nome} ${JSON.stringify(formulario.respostas)}`
              ).includes(termo)
            )
            .slice(0, 10)
            .map((formulario) => ({
              aluna: formulario.alunas?.nome ?? "(sem aluna vinculada)",
              formulario_nome: formulario.formulario_nome,
              respondido_em: formulario.respondido_em,
              respostas: formulario.respostas,
            }));
          if (encontrados.length === 0) {
            return respostaJson({
              resultados: [],
              aviso: `Nenhuma resposta de formulário contém "${query}".`,
            });
          }
          return respostaJson({ resultados: encontrados });
        })
    );
  }

  if (permitidas.has("enviar_lembrete_pagamento")) {
    servidor.registerTool(
      "enviar_lembrete_pagamento",
      {
        title: "Enviar lembrete de pagamento",
        description:
          "Envia um lembrete de pagamento por WhatsApp (Evolution API) pra aluna, listando os pagamentos vencidos e não pagos. Ação auditada.",
        inputSchema: {
          aluna_id: z.uuid().describe("Id (UUID) da aluna"),
        },
      },
      ({ aluna_id: alunaId }) =>
        comAuditoria(token, "enviar_lembrete_pagamento", alunaId, () =>
          acaoEnviarLembretePagamento(alunaId)
        )
    );
  }

  if (permitidas.has("criar_task_asana")) {
    servidor.registerTool(
      "criar_task_asana",
      {
        title: "Criar task no Asana",
        description:
          "Cria uma task no projeto do Asana vinculada à aluna e espelha na tabela tasks_asana. Ação auditada.",
        inputSchema: {
          aluna_id: z.uuid().describe("Id (UUID) da aluna"),
          titulo: z.string().min(3).describe("Título da task"),
          descricao: z.string().default("").describe("Descrição/notas da task"),
        },
      },
      ({ aluna_id: alunaId, titulo, descricao }) =>
        comAuditoria(token, "criar_task_asana", alunaId, () =>
          acaoCriarTaskAsana(alunaId, titulo, descricao)
        )
    );
  }

  if (permitidas.has("remarcar_reuniao")) {
    servidor.registerTool(
      "remarcar_reuniao",
      {
        title: "Remarcar reunião",
        description:
          "Cancela a próxima reunião do Calendly da aluna (via API) e registra o novo horário internamente. Atenção: a API do Calendly não cria agendamento — confirme o novo horário com a aluna ou envie o link de agendamento. Ação auditada.",
        inputSchema: {
          aluna_id: z.uuid().describe("Id (UUID) da aluna"),
          novo_horario: z
            .string()
            .refine((valor) => !Number.isNaN(Date.parse(valor)), {
              message:
                "novo_horario precisa ser uma data ISO válida (ex.: 2026-07-30T14:00:00-03:00)",
            })
            .describe("Novo horário em formato ISO"),
        },
      },
      ({ aluna_id: alunaId, novo_horario: novoHorario }) =>
        comAuditoria(token, "remarcar_reuniao", alunaId, () =>
          acaoRemarcarReuniao(alunaId, novoHorario)
        )
    );
  }

  return servidor;
}
