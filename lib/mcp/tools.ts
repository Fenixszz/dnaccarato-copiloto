import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getServiceClient } from "@/lib/db/client";
import { montarDossie, type DossieRow } from "@/lib/dossie";
import { detectarFuros } from "@/lib/matching/furos";
import { encontrarMelhorMatch } from "@/lib/matching/matcher";
import { buscarEmails } from "@/lib/integrations/gmail";

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
];

export function acharFerramenta(nome: string): FerramentaMcp | undefined {
  return FERRAMENTAS.find((f) => f.name === nome);
}
