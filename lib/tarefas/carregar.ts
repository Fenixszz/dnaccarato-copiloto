/**
 * Loader das tarefas do Asana para o dashboard.
 *
 * As tarefas vêm de `tasks_asana` (populada pelo webhook do Asana e pela tool
 * MCP `criar_task`), sempre vinculadas a uma aluna. A ordenação (abertas antes,
 * depois concluídas, removidas por último; dentro do grupo, mais recentes
 * primeiro) é uma função PURA e testada.
 */
import { getServiceClient } from "@/lib/db/client";

export type EstadoTarefa = "aberta" | "concluida" | "removida";

export interface TarefaItem {
  id: string;
  titulo: string;
  status: string | null;
  criado_em: string | null;
  concluido_em: string | null;
  aluna: { id: string; nome: string } | null;
}

/** Traduz o `status` cru de `tasks_asana` para o estado de exibição. */
export function estadoTarefa(status: string | null | undefined): EstadoTarefa {
  if (status === "concluida") return "concluida";
  if (status === "removida") return "removida";
  return "aberta"; // "em_andamento", null ou qualquer outro = aberta
}

const ORDEM: Record<EstadoTarefa, number> = { aberta: 0, concluida: 1, removida: 2 };

/**
 * Ordena as tarefas: abertas primeiro, depois concluídas, removidas por último;
 * dentro de cada grupo, as mais recentes (por `criado_em`) na frente. Pura.
 */
export function ordenarTarefas<
  T extends { status: string | null; criado_em: string | null },
>(tarefas: T[]): T[] {
  return [...tarefas].sort((a, b) => {
    const grupo = ORDEM[estadoTarefa(a.status)] - ORDEM[estadoTarefa(b.status)];
    if (grupo !== 0) return grupo;
    const ta = a.criado_em ? Date.parse(a.criado_em) : 0;
    const tb = b.criado_em ? Date.parse(b.criado_em) : 0;
    return tb - ta; // mais recentes primeiro
  });
}

/** Formato cru vindo do PostgREST (a relação to-one pode vir objeto ou array). */
interface TarefaRaw {
  id: string;
  titulo: string;
  status: string | null;
  criado_em: string | null;
  concluido_em: string | null;
  aluna: { id: string; nome: string } | { id: string; nome: string }[] | null;
}

/** Carrega todas as tarefas do Asana com o nome da aluna, já ordenadas. */
export async function carregarTarefas(): Promise<TarefaItem[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("tasks_asana")
    .select("id, titulo, status, criado_em, concluido_em, aluna:alunas(id, nome)")
    .order("criado_em", { ascending: false });
  if (error !== null) {
    throw new Error(`Falha ao carregar as tarefas: ${error.message}`);
  }

  const itens: TarefaItem[] = ((data ?? []) as TarefaRaw[]).map((t) => {
    const aluna = Array.isArray(t.aluna) ? t.aluna[0] : t.aluna;
    return {
      id: t.id,
      titulo: t.titulo,
      status: t.status,
      criado_em: t.criado_em,
      concluido_em: t.concluido_em,
      aluna: aluna ? { id: aluna.id, nome: aluna.nome } : null,
    };
  });

  return ordenarTarefas(itens);
}
