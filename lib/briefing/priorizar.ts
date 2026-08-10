import type { Furo, Severidade } from "@/lib/matching/furos";

/**
 * Priorização dos furos de todas as alunas ativas para o briefing diário.
 *
 * Ordem de prioridade (do mais urgente para o menos):
 *   assinatura rejeitada > atraso de pagamento > documento parado >
 *   reunião não marcada > SLA de task estourado.
 *
 * As funções aqui são PURAS (não buscam nada): recebem os furos já detectados
 * (detectar_furos) e, opcionalmente, os compromissos do dia (lidos na hora de
 * montar o briefing) para o resumo de agenda no final.
 */

// Rank por tipo de furo (menor = mais urgente). Cobre os tipos atuais e já deixa
// lugar para "pagamento_atrasado"/"documento_parado" caso o detector evolua.
const RANK_POR_TIPO: Record<string, number> = {
  assinatura_rejeitada: 0, // assinatura rejeitada
  pagamento_atrasado: 1, // atraso de pagamento
  documento_parado: 2, // documento parado
  pagou_sem_contrato: 2, // pagou e o contrato travou == documento parado
  assinou_sem_reuniao: 3, // reunião não marcada
  formulario_sem_followup: 4,
  task_parada: 5, // SLA de task estourado
};

const RANK_SEVERIDADE: Record<Severidade, number> = { critica: 0, alta: 1, media: 2 };

export interface FurosDaAluna {
  aluna: { id: string; nome: string };
  furos: Furo[];
}

export interface FuroPriorizado {
  aluna: { id: string; nome: string };
  furo: Furo;
}

/** Compromisso do dia (já formatado), usado no resumo de agenda do briefing. */
export interface Compromisso {
  hora: string;
  titulo: string;
}

const MAX_PADRAO = 3;

/**
 * Achata os furos de todas as alunas, ordena por prioridade (tipo, depois
 * severidade) e devolve os N mais urgentes (padrão 3).
 */
export function priorizarFuros(
  entradas: FurosDaAluna[],
  max: number = MAX_PADRAO,
): FuroPriorizado[] {
  const todos: FuroPriorizado[] = [];
  for (const entrada of entradas) {
    for (const furo of entrada.furos) {
      todos.push({ aluna: entrada.aluna, furo });
    }
  }

  const rankTipo = (f: Furo): number => RANK_POR_TIPO[f.tipo] ?? Number.MAX_SAFE_INTEGER;

  todos.sort(
    (a, b) =>
      rankTipo(a.furo) - rankTipo(b.furo) ||
      RANK_SEVERIDADE[a.furo.severidade] - RANK_SEVERIDADE[b.furo.severidade],
  );

  return todos.slice(0, Math.max(0, max));
}

/**
 * Monta o texto do briefing: "Bom dia, Adriana. X coisas hoje: ...", com os
 * furos priorizados e, no final, um resumo curto da agenda do dia (se houver).
 */
export function gerarTextoBriefing(
  prioritizados: FuroPriorizado[],
  compromissos: Compromisso[] = [],
): string {
  const linhas: string[] = [];

  if (prioritizados.length === 0) {
    linhas.push(
      "Bom dia, Adriana. Tudo em dia por aqui — nenhuma pendência urgente hoje. 🎉",
    );
  } else {
    const n = prioritizados.length;
    linhas.push(`Bom dia, Adriana. ${n} ${n === 1 ? "coisa" : "coisas"} pra hoje:`);
    prioritizados.forEach((p, i) => {
      linhas.push(`${i + 1}. ${p.aluna.nome} — ${p.furo.mensagem}`);
    });
  }

  if (compromissos.length > 0) {
    const n = compromissos.length;
    const itens = compromissos.map((c) => `${c.hora} ${c.titulo}`).join("; ");
    linhas.push("");
    linhas.push(
      `Na sua agenda hoje: ${n} ${n === 1 ? "compromisso" : "compromissos"} — ${itens}.`,
    );
  }

  return linhas.join("\n");
}
