import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getServiceClient } from "@/lib/db/client";
import { montarDossie, type DossieRow } from "@/lib/dossie";
import { detectarFuros } from "@/lib/matching/furos";

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

export const FERRAMENTAS: FerramentaMcp[] = [
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
