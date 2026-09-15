/**
 * Sincroniza os cards da coluna CONSULTORIA do Asana (fonte da verdade das
 * mentoradas, junto com o Drive) para `tasks_asana`, casando/criando a aluna.
 *
 * Roda como cron no Vercel (`/api/cron/asana-sync`) — as escritas acontecem no
 * servidor. Cada card = uma tarefa (1 por mentorada), com status do card; o
 * webhook do Asana mantém o `completed` atualizado depois. Idempotente (upsert
 * por task_id). A resolução card→aluna é pura e testada.
 */
import { getServiceClient } from "@/lib/db/client";
import { requireEnv } from "@/lib/env";
import {
  listarSecoes,
  listarTarefasDaSecao,
  type TaskAsana,
} from "@/lib/integrations/asana";
import { acharAlunaPorNomePasta } from "@/lib/materiais";

type SupabaseServer = ReturnType<typeof getServiceClient>;

/** Nome da coluna do Asana que lista as mentoradas (fonte da verdade). */
const SECAO_CONSULTORIA = "consultoria";

/**
 * Apelidos de card → nome da aluna, confirmados pelo João (nomes divergem entre
 * o Asana e o cadastro). Ex.: o card "DUDA -" é a Maria Eduarda Kawamoto.
 */
export const APELIDOS_CARDS: Record<string, string> = {
  duda: "Maria Eduarda Kawamoto",
  rafa: "Rafaela Fera",
  antonella: "Antonella Bacchin",
  "guilherme veloso": "Guilherme Velloso", // card tem 1 "L" a menos que o cadastro
};

/** Limpa o nome do card: tira " -", espaços e traços do fim ("DUDA -" → "DUDA"). */
export function normalizarNomeCard(nome: string): string {
  return nome.replace(/[\s-]+$/, "").trim();
}

/** Status de `tasks_asana` a partir do `completed` do card. */
export function statusDaTarefa(
  completed: boolean | undefined,
): "concluida" | "em_andamento" {
  return completed === true ? "concluida" : "em_andamento";
}

interface AlunaMin {
  id: string;
  nome: string;
}

/**
 * Resolve a aluna de um card: aplica apelido conhecido e casa por nome (motor
 * de matching). Retorna o id, ou null se nenhuma aluna casar (→ criar).
 */
export function resolverAlunaId(
  cardNome: string,
  alunas: readonly AlunaMin[],
): string | null {
  const limpo = normalizarNomeCard(cardNome);
  const alvo = APELIDOS_CARDS[limpo.toLowerCase()] ?? limpo;
  return acharAlunaPorNomePasta(alunas, alvo);
}

/** Upsert de uma tarefa (dedupe por task_id = gid do card). */
async function upsertTarefa(
  db: SupabaseServer,
  alunaId: string,
  card: TaskAsana,
  titulo: string,
): Promise<void> {
  const registro = {
    aluna_id: alunaId,
    task_id: card.gid,
    titulo,
    status: statusDaTarefa(card.completed),
    concluido_em: card.completed ? (card.completed_at ?? null) : null,
  };
  const { data, error } = await db
    .from("tasks_asana")
    .select("id")
    .eq("task_id", card.gid)
    .limit(1);
  if (error) throw new Error(`Falha ao buscar tarefa existente: ${error.message}`);
  const existente = data?.[0];
  if (existente) {
    const { error: eUp } = await db
      .from("tasks_asana")
      .update(registro)
      .eq("id", existente.id);
    if (eUp) throw new Error(`Falha ao atualizar tarefa: ${eUp.message}`);
  } else {
    const { error: eIns } = await db.from("tasks_asana").insert(registro);
    if (eIns) throw new Error(`Falha ao inserir tarefa: ${eIns.message}`);
  }
}

export interface ResultadoSyncAsana {
  cards: number;
  alunasCriadas: number;
  tarefas: number;
}

/** Executa a sincronização completa da coluna CONSULTORIA. */
export async function sincronizarTarefasAsana(): Promise<ResultadoSyncAsana> {
  const projectGid = requireEnv("ASANA_WEBHOOK_RESOURCE_ID");
  const db = getServiceClient();

  const secoes = await listarSecoes(projectGid);
  const consultoria = secoes.find(
    (s) => s.name.trim().toLowerCase() === SECAO_CONSULTORIA,
  );
  if (!consultoria) {
    throw new Error("Asana: coluna CONSULTORIA não encontrada no projeto.");
  }
  const cards = await listarTarefasDaSecao(consultoria.gid);

  const { data, error } = await db
    .from("alunas")
    .select("id, nome, metadata")
    .is("anonimizada_em", null);
  if (error) throw new Error(`Falha ao carregar alunas: ${error.message}`);
  const alunas = (data ?? []) as {
    id: string;
    nome: string;
    metadata: Record<string, unknown> | null;
  }[];

  let alunasCriadas = 0;
  let tarefas = 0;

  for (const card of cards) {
    const nome = normalizarNomeCard(card.name ?? "");
    if (!nome) continue;

    let alunaId = resolverAlunaId(card.name ?? "", alunas);

    if (!alunaId) {
      // Card sem aluna → cria já confirmada como mentorada (fonte da verdade).
      const { data: nova, error: eIns } = await db
        .from("alunas")
        .insert({ nome, metadata: { origem_cadastro: "asana", mentorada: true } })
        .select("id, nome, metadata")
        .single();
      if (eIns || !nova) {
        throw new Error(`Falha ao criar aluna do card "${nome}": ${eIns?.message}`);
      }
      alunaId = nova.id;
      alunas.push(
        nova as { id: string; nome: string; metadata: Record<string, unknown> },
      );
      alunasCriadas += 1;
    } else {
      // Aluna existente → confirma mentorada:true (ela está na CONSULTORIA).
      const aluna = alunas.find((a) => a.id === alunaId);
      const meta = (aluna?.metadata ?? {}) as Record<string, unknown>;
      if (meta.mentorada !== true) {
        await db
          .from("alunas")
          .update({ metadata: { ...meta, mentorada: true } })
          .eq("id", alunaId);
      }
    }

    await upsertTarefa(db, alunaId, card, nome);
    tarefas += 1;
  }

  return { cards: cards.length, alunasCriadas, tarefas };
}
