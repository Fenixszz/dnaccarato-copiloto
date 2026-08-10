import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getServiceClient } from "@/lib/db/client";
import { optionalEnv } from "@/lib/env";
import { montarDossie, type DossieRow } from "@/lib/dossie";
import { detectarFuros } from "@/lib/matching/furos";
import { encontrarMelhorMatch, normalizarTelefone } from "@/lib/matching/matcher";
import { buscarEmails } from "@/lib/integrations/gmail";
import { enviarTexto } from "@/lib/whatsapp/client";
import { criarTask } from "@/lib/integrations/asana";
import { cancelarEvento } from "@/lib/integrations/calendly";
import type { Json } from "@/lib/db/types";

/**
 * Erro "de negócio" da ferramenta (ex.: aluna não encontrada). A rota MCP
 * devolve a mensagem ao cliente — é segura/clara. Erros que NÃO são desta
 * classe são tratados como internos e não têm a mensagem exposta.
 */
export class ErroFerramenta extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroFerramenta";
  }
}

/**
 * Registro de ferramentas (tools) do servidor MCP. Cada tool declara o
 * inputSchema (JSON Schema, exposto no tools/list), um schema Zod para validar
 * os argumentos, e um handler. Só leitura por enquanto.
 */

export interface FerramentaMcp {
  name: string;
  description: string;
  inputSchema: Tool["inputSchema"];
  argsSchema: z.ZodTypeAny;
  executar(args: unknown): Promise<unknown>;
  /** Detalhes extras (sem dado sensível) para a auditoria da chamada. */
  resumoAuditoria?(args: unknown, resultado: unknown): Record<string, Json>;
}

const SELECT_DOSSIE = `
  id, nome, email, telefone, criado_em, metadata,
  pagamentos ( id, origem, status, valor, vencimento, pago_em, referencia_externa ),
  documentos ( id, tipo, status, origem, assinado_em, motivo_rejeicao, link_assinado ),
  materiais ( id, nome_arquivo, tipo, link_drive, adicionado_em ),
  formularios ( id, formulario_nome, respostas, respondido_em ),
  reunioes ( id, origem, data_hora, status, link ),
  tasks_asana ( id, task_id, titulo, status, criado_em, concluido_em )
`;

interface AlunaMin {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
}

/** Resolve uma aluna pelo nome (matching fuzzy). Lança ErroFerramenta se não achar. */
async function resolverAlunaPorNome(nome: string): Promise<AlunaMin> {
  const db = getServiceClient();
  const { data, error } = await db.from("alunas").select("id, nome, email, telefone");
  if (error) throw new Error(error.message);
  const alunas = (data ?? []) as AlunaMin[];
  const match = encontrarMelhorMatch({ nome }, alunas, (a) => ({
    nome: a.nome,
    email: a.email,
    telefone: a.telefone,
  }));
  if (!match) throw new ErroFerramenta(`Aluna não encontrada: "${nome}".`);
  return match.registro;
}

/** Variações do lembrete de pagamento (mesma informação, texto levemente diferente). */
function variacoesLembrete(nome: string): string[] {
  return [
    `Oi, ${nome}! Passando pra lembrar do seu pagamento em aberto por aqui. Qualquer dúvida, é só chamar. 💜`,
    `Olá ${nome}, tudo bem? Notamos um pagamento pendente na sua conta — consegue dar uma olhadinha? Ficamos à disposição!`,
    `${nome}, tudo certo? Só um lembrete rápido: consta um pagamento em aberto. Se já tiver pago, pode desconsiderar. 🙌`,
  ];
}

/** Índice pseudo-aleatório porém determinístico por semente (mesma aluna → mesma variação). */
function indiceVariacao(semente: string, total: number): number {
  let h = 0;
  for (const ch of semente) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % total;
}

/** Extrai o UUID do scheduled_event a partir da uri do invitee do Calendly. */
function extrairEventUuid(inviteeUri: string): string | null {
  return /scheduled_events\/([^/]+)/.exec(inviteeUri)?.[1] ?? null;
}

export const FERRAMENTAS: FerramentaMcp[] = [
  {
    name: "status_aluna",
    description: "Dossiê agregado de uma aluna, buscada pelo nome.",
    inputSchema: {
      type: "object",
      properties: { nome: { type: "string", description: "Nome da aluna" } },
      required: ["nome"],
    },
    argsSchema: z.object({ nome: z.string().min(1) }),
    async executar(args) {
      const { nome } = args as { nome: string };
      const aluna = await resolverAlunaPorNome(nome);
      const db = getServiceClient();
      const { data, error } = await db
        .from("alunas")
        .select(SELECT_DOSSIE)
        .eq("id", aluna.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new ErroFerramenta(`Aluna não encontrada: "${nome}".`);
      return montarDossie(data as unknown as DossieRow);
    },
  },
  {
    name: "pagamentos_pendentes",
    description: "Lista alunas com pagamento atrasado.",
    inputSchema: { type: "object", properties: {} },
    argsSchema: z.object({}),
    async executar() {
      const db = getServiceClient();
      const { data, error } = await db
        .from("pagamentos")
        .select("aluna_id, valor, vencimento, status, alunas ( id, nome, email )")
        .eq("status", "atrasado");
      if (error) throw new Error(error.message);
      return { pagamentos_atrasados: data ?? [] };
    },
  },
  {
    name: "documentos_nao_assinados",
    description:
      "Pendências de assinatura: documentos pendentes e rejeitados (separados).",
    inputSchema: { type: "object", properties: {} },
    argsSchema: z.object({}),
    async executar() {
      const db = getServiceClient();
      const { data, error } = await db
        .from("documentos")
        .select("id, tipo, status, motivo_rejeicao, alunas ( id, nome, email )")
        .in("status", ["pendente", "rejeitado"]);
      if (error) throw new Error(error.message);
      const docs = (data ?? []) as { status: string }[];
      return {
        pendentes: docs.filter((d) => d.status === "pendente"),
        rejeitados: docs.filter((d) => d.status === "rejeitado"),
      };
    },
  },
  {
    name: "proxima_reuniao",
    description: "Próxima reunião agendada de uma aluna (pelo nome).",
    inputSchema: {
      type: "object",
      properties: { nome: { type: "string", description: "Nome da aluna" } },
      required: ["nome"],
    },
    argsSchema: z.object({ nome: z.string().min(1) }),
    async executar(args) {
      const { nome } = args as { nome: string };
      const aluna = await resolverAlunaPorNome(nome);
      const db = getServiceClient();
      const { data, error } = await db
        .from("reunioes")
        .select("id, origem, data_hora, status, link")
        .eq("aluna_id", aluna.id);
      if (error) throw new Error(error.message);
      const reunioes = (data ?? []) as {
        data_hora: string | null;
        status: string | null;
      }[];
      const agora = Date.now();
      const proxima =
        reunioes
          .map((r) => ({ r, t: r.data_hora ? Date.parse(r.data_hora) : Number.NaN }))
          .filter((x) => !Number.isNaN(x.t) && x.t >= agora && x.r.status !== "cancelada")
          .sort((a, b) => a.t - b.t)[0]?.r ?? null;
      return { aluna: aluna.nome, proxima_reuniao: proxima };
    },
  },
  {
    name: "buscar_formulario",
    description: "Busca respostas de formulário pelo nome do formulário.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nome do formulário (parcial)" },
      },
      required: ["query"],
    },
    argsSchema: z.object({ query: z.string().min(1) }),
    async executar(args) {
      const { query } = args as { query: string };
      const db = getServiceClient();
      const { data, error } = await db
        .from("formularios")
        .select("id, formulario_nome, respondido_em, alunas ( id, nome, email )")
        .ilike("formulario_nome", `%${query}%`)
        .limit(20);
      if (error) throw new Error(error.message);
      return { formularios: data ?? [] };
    },
  },
  {
    name: "buscar_email",
    description:
      "Busca no Gmail da Adriana e-mails relacionados a uma aluna (assunto, trecho e data).",
    inputSchema: {
      type: "object",
      properties: {
        aluna_id: { type: "string", description: "UUID da aluna" },
        query: { type: "string", description: "Termo de busca" },
      },
      required: ["aluna_id", "query"],
    },
    argsSchema: z.object({ aluna_id: z.string().uuid(), query: z.string().min(1) }),
    async executar(args) {
      const { aluna_id, query } = args as { aluna_id: string; query: string };
      const db = getServiceClient();
      const { data, error } = await db
        .from("alunas")
        .select("id, nome, email")
        .eq("id", aluna_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new ErroFerramenta(`Aluna não encontrada: ${aluna_id}.`);

      const aluna = data as { nome: string; email: string | null };
      const escopoBusca = aluna.email
        ? `(from:${aluna.email} OR to:${aluna.email})`
        : `"${aluna.nome}"`;
      const emails = await buscarEmails(`${query} ${escopoBusca}`, 5);
      return { emails };
    },
  },
  {
    name: "buscar_aluna",
    description: "Busca alunas por nome ou email (correspondência parcial).",
    inputSchema: {
      type: "object",
      properties: { termo: { type: "string", description: "Nome ou email (parcial)" } },
      required: ["termo"],
    },
    argsSchema: z.object({ termo: z.string().min(1) }),
    async executar(args) {
      const { termo } = args as { termo: string };
      const like = `%${termo}%`;
      const db = getServiceClient();
      const { data, error } = await db
        .from("alunas")
        .select("id, nome, email, telefone")
        .or(`nome.ilike.${like},email.ilike.${like}`)
        .limit(20);
      if (error) throw new Error(error.message);
      return { alunas: data ?? [] };
    },
  },
  {
    name: "dossie_aluna",
    description:
      "Retorna o dossiê agregado de uma aluna (cadastro, pagamentos, documentos, etc).",
    inputSchema: {
      type: "object",
      properties: { aluna_id: { type: "string", description: "UUID da aluna" } },
      required: ["aluna_id"],
    },
    argsSchema: z.object({ aluna_id: z.string().uuid() }),
    async executar(args) {
      const { aluna_id } = args as { aluna_id: string };
      const db = getServiceClient();
      const { data, error } = await db
        .from("alunas")
        .select(SELECT_DOSSIE)
        .eq("id", aluna_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Aluna não encontrada.");
      return montarDossie(data as unknown as DossieRow);
    },
  },
  {
    name: "detectar_furos",
    description: "Lista os furos operacionais de uma aluna (rejeições, pendências, etc).",
    inputSchema: {
      type: "object",
      properties: { aluna_id: { type: "string", description: "UUID da aluna" } },
      required: ["aluna_id"],
    },
    argsSchema: z.object({ aluna_id: z.string().uuid() }),
    async executar(args) {
      const { aluna_id } = args as { aluna_id: string };
      return { furos: await detectarFuros(aluna_id) };
    },
  },

  // ----------------------------- Tools de ESCRITA -----------------------------
  {
    name: "enviar_lembrete_pagamento",
    description:
      "Envia um lembrete de pagamento pela WhatsApp (Evolution API) para a aluna.",
    inputSchema: {
      type: "object",
      properties: { aluna_id: { type: "string", description: "UUID da aluna" } },
      required: ["aluna_id"],
    },
    argsSchema: z.object({ aluna_id: z.string().uuid() }),
    async executar(args) {
      const { aluna_id } = args as { aluna_id: string };
      const db = getServiceClient();
      const { data, error } = await db
        .from("alunas")
        .select("id, nome, telefone")
        .eq("id", aluna_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new ErroFerramenta(`Aluna não encontrada: ${aluna_id}.`);

      const aluna = data as { nome: string; telefone: string | null };
      if (!aluna.telefone) throw new ErroFerramenta("Aluna sem telefone cadastrado.");

      const primeiroNome = aluna.nome.split(" ")[0] ?? aluna.nome;
      const variacoes = variacoesLembrete(primeiroNome);
      const i = indiceVariacao(aluna_id, variacoes.length);
      const texto =
        variacoes[i] ?? variacoes[0] ?? `Lembrete de pagamento, ${primeiroNome}.`;

      // Passa pelo rate limiter compartilhado (dentro de enviarTexto).
      const envio = await enviarTexto({
        numero: normalizarTelefone(aluna.telefone),
        texto,
      });
      if (!envio.ok) {
        throw new Error(`Evolution: envio falhou (HTTP ${envio.status}).`);
      }
      return { enviado: true, variacao: i, texto };
    },
    resumoAuditoria(args, resultado) {
      return {
        aluna_id: (args as { aluna_id: string }).aluna_id,
        canal: "whatsapp",
        variacao: (resultado as { variacao: number }).variacao,
      };
    },
  },
  {
    name: "criar_task_asana",
    description: "Cria uma task no Asana e vincula à aluna.",
    inputSchema: {
      type: "object",
      properties: {
        aluna_id: { type: "string", description: "UUID da aluna" },
        titulo: { type: "string" },
        descricao: { type: "string" },
      },
      required: ["aluna_id", "titulo"],
    },
    argsSchema: z.object({
      aluna_id: z.string().uuid(),
      titulo: z.string().min(1),
      descricao: z.string().optional(),
    }),
    async executar(args) {
      const { aluna_id, titulo, descricao } = args as {
        aluna_id: string;
        titulo: string;
        descricao?: string;
      };
      const db = getServiceClient();
      const { data, error } = await db
        .from("alunas")
        .select("id, nome")
        .eq("id", aluna_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new ErroFerramenta(`Aluna não encontrada: ${aluna_id}.`);

      const workspace = optionalEnv("ASANA_WORKSPACE_ID");
      const projeto = optionalEnv("ASANA_WEBHOOK_RESOURCE_ID");
      if (!workspace && !projeto) {
        throw new Error("Configure ASANA_WORKSPACE_ID ou ASANA_WEBHOOK_RESOURCE_ID.");
      }

      const nomeAluna = (data as { nome: string }).nome;
      const notas = descricao
        ? `${descricao}\n\n(Aluna: ${nomeAluna})`
        : `Aluna: ${nomeAluna}`;
      const criada = await criarTask({
        nome: titulo,
        notas,
        workspace: workspace || undefined,
        projeto: projeto || undefined,
      });

      // Vincula na nossa tabela para o webhook manter atualizado depois.
      const { error: eIns } = await db
        .from("tasks_asana")
        .insert({ aluna_id, task_id: criada.gid, titulo, status: "em_andamento" });
      if (eIns) throw new Error(`Falha ao vincular a task: ${eIns.message}`);

      return { task_id: criada.gid, titulo };
    },
    resumoAuditoria(args, resultado) {
      return {
        aluna_id: (args as { aluna_id: string }).aluna_id,
        task_id: (resultado as { task_id: string }).task_id,
        titulo: (args as { titulo: string }).titulo,
      };
    },
  },
  {
    name: "remarcar_reuniao",
    description:
      "Cancela a reunião atual da aluna no Calendly para remarcação (a aluna reconfirma o novo horário).",
    inputSchema: {
      type: "object",
      properties: {
        aluna_id: { type: "string", description: "UUID da aluna" },
        novo_horario: { type: "string", description: "Novo horário desejado (ISO 8601)" },
      },
      required: ["aluna_id", "novo_horario"],
    },
    argsSchema: z.object({
      aluna_id: z.string().uuid(),
      novo_horario: z.string().datetime(),
    }),
    async executar(args) {
      const { aluna_id, novo_horario } = args as {
        aluna_id: string;
        novo_horario: string;
      };
      const db = getServiceClient();
      const { data, error } = await db
        .from("reunioes")
        .select("id, referencia_externa, status")
        .eq("aluna_id", aluna_id)
        .eq("origem", "calendly")
        .eq("status", "agendada")
        .limit(1);
      if (error) throw new Error(error.message);

      const reuniao = (data ?? [])[0] as
        { id: string; referencia_externa: string | null } | undefined;
      const ref = reuniao?.referencia_externa ?? null;
      const eventUuid = ref ? extrairEventUuid(ref) : null;
      if (!reuniao || !eventUuid) {
        throw new ErroFerramenta("Nenhuma reunião agendada do Calendly para esta aluna.");
      }

      await cancelarEvento(eventUuid, `Remarcação solicitada para ${novo_horario}.`);

      const { error: eUp } = await db
        .from("reunioes")
        .update({ status: "cancelada" })
        .eq("id", reuniao.id);
      if (eUp) throw new Error(`Falha ao atualizar a reunião: ${eUp.message}`);

      return {
        evento: eventUuid,
        cancelada: true,
        novo_horario_solicitado: novo_horario,
        aviso: "Reunião atual cancelada; a aluna deve reconfirmar o novo horário.",
      };
    },
    resumoAuditoria(args) {
      return {
        aluna_id: (args as { aluna_id: string }).aluna_id,
        novo_horario: (args as { novo_horario: string }).novo_horario,
      };
    },
  },
];

export function acharFerramenta(nome: string): FerramentaMcp | undefined {
  return FERRAMENTAS.find((f) => f.name === nome);
}
