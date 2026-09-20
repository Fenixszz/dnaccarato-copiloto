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
  listarSubtarefas,
  type TaskAsana,
} from "@/lib/integrations/asana";
import { acharAlunaPorNomePasta } from "@/lib/materiais";

type SupabaseServer = ReturnType<typeof getServiceClient>;

/** Colunas do Asana que listam mentoradas (fonte da verdade). */
const SECOES_MENTORADAS = ["consultoria", "mentoria"];

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
  const porMatcher = acharAlunaPorNomePasta(alunas, alvo);
  if (porMatcher) return porMatcher;
  // Fallback: nome EXATO (case-insensitive). O matcher não casa nomes de uma só
  // palavra consigo mesmos (ex.: "Evelyn"), o que fazia cada sync criar uma
  // aluna nova. O exato garante idempotência.
  const exato = alunas.find(
    (a) => a.nome.trim().toLowerCase() === alvo.trim().toLowerCase(),
  );
  return exato?.id ?? null;
}

/** Upsert de uma tarefa (dedupe por task_id = gid da tarefa/subtarefa). */
async function upsertTarefa(
  db: SupabaseServer,
  alunaId: string,
  tarefa: TaskAsana,
  titulo: string,
): Promise<void> {
  const registro = {
    aluna_id: alunaId,
    task_id: tarefa.gid,
    titulo,
    status: statusDaTarefa(tarefa.completed),
    criado_em: tarefa.created_at ?? null,
    concluido_em: tarefa.completed ? (tarefa.completed_at ?? null) : null,
  };
  // Upsert atômico (INSERT ... ON CONFLICT (task_id) DO UPDATE): idempotente e
  // imune à corrida de select-depois-insert (réplica de leitura defasada).
  const { error } = await db
    .from("tasks_asana")
    .upsert(registro, { onConflict: "task_id" });
  if (error) throw new Error(`Falha ao gravar tarefa: ${error.message}`);
}

export interface ResultadoSyncAsana {
  cards: number;
  tarefas: number;
  /** Nomes de cards sem aluna correspondente (NÃO criamos — evita duplicar). */
  naoImportadas: string[];
}

/** Executa a sincronização completa da coluna CONSULTORIA. */
export async function sincronizarTarefasAsana(): Promise<ResultadoSyncAsana> {
  const projectGid = requireEnv("ASANA_WEBHOOK_RESOURCE_ID");
  const db = getServiceClient();

  const secoes = await listarSecoes(projectGid);
  const alvo = secoes.filter((s) =>
    SECOES_MENTORADAS.includes(s.name.trim().toLowerCase()),
  );
  if (alvo.length === 0) {
    throw new Error("Asana: nenhuma coluna CONSULTORIA/MENTORIA encontrada no projeto.");
  }
  // Junta os cards de todas as colunas de mentorada (CONSULTORIA + MENTORIA).
  const cards: TaskAsana[] = [];
  for (const sec of alvo) cards.push(...(await listarTarefasDaSecao(sec.gid)));

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

  let tarefas = 0;
  const naoImportadas: string[] = [];

  for (const card of cards) {
    const nome = normalizarNomeCard(card.name ?? "");
    if (!nome) continue;

    const alunaId = resolverAlunaId(card.name ?? "", alunas);

    // NÃO criamos aluna aqui: a leitura pode vir de réplica defasada e, sem
    // unique por nome, isso duplicaria a cada rodada. Card sem aluna é
    // reportado — a aluna é criada uma vez (Drive/manual) e o sync vincula.
    if (!alunaId) {
      naoImportadas.push(nome);
      continue;
    }

    // Aluna existente → confirma mentorada:true (ela está na CONSULTORIA).
    const aluna = alunas.find((a) => a.id === alunaId);
    const meta = (aluna?.metadata ?? {}) as Record<string, unknown>;
    if (meta.mentorada !== true) {
      await db
        .from("alunas")
        .update({ metadata: { ...meta, mentorada: true } })
        .eq("id", alunaId);
    }

    // Importa as SUBTAREFAS do card (as tarefas reais da mentorada).
    const subtarefas = await listarSubtarefas(card.gid);
    for (const sub of subtarefas) {
      const titulo = (sub.name ?? "").trim();
      if (!titulo) continue;
      await upsertTarefa(db, alunaId, sub, titulo);
      tarefas += 1;
    }

    // Remove o registro antigo do próprio card (quando importávamos o card como
    // tarefa) — agora quem vira tarefa são as subtarefas.
    await db.from("tasks_asana").delete().eq("task_id", card.gid);
  }

  return { cards: cards.length, tarefas, naoImportadas };
}
