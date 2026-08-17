import type { Furo, Severidade, TipoFuro } from "@/lib/matching/furos";

/**
 * Rótulos/apresentação dos furos (sem regra de negócio). Puro — importável por
 * server components e pela server action (que só passa `titulo` já pronto).
 */

/** Ordem de urgência para ordenar furos de alunas diferentes num só painel. */
export const RANK_SEVERIDADE: Record<Severidade, number> = {
  critica: 0,
  alta: 1,
  media: 2,
};

/** Classes Tailwind do badge de severidade. */
export const CORES_SEVERIDADE: Record<Severidade, string> = {
  critica: "bg-red-100 text-red-800",
  alta: "bg-amber-100 text-amber-800",
  media: "bg-slate-100 text-slate-700",
};

/** Título curto e acionável para a task do Asana criada a partir de um furo. */
const TITULO_POR_TIPO: Record<TipoFuro, string> = {
  assinatura_rejeitada: "Contatar sobre assinatura rejeitada",
  pagou_sem_contrato: "Cobrar assinatura do contrato",
  assinou_sem_reuniao: "Agendar reunião",
  formulario_sem_followup: "Fazer follow-up do formulário",
  task_parada: "Retomar task parada",
};

export function tituloTaskDoFuro(furo: Furo): string {
  return TITULO_POR_TIPO[furo.tipo] ?? "Resolver pendência";
}
