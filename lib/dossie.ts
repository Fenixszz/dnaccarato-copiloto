import type { Tables } from "@/lib/db/types";

/**
 * Monta o "dossiê" agregado de uma aluna a partir de UMA linha já com as
 * relações embutidas (uma única query PostgREST — sem N+1). A função é pura e
 * defensiva: se alguma relação ainda não existe, entra como lista vazia / null.
 */

type AlunaBase = Pick<
  Tables<"alunas">,
  "id" | "nome" | "email" | "telefone" | "criado_em" | "metadata"
>;
type PagamentoDossie = Pick<
  Tables<"pagamentos">,
  "id" | "origem" | "status" | "valor" | "vencimento" | "pago_em" | "referencia_externa"
>;
type DocumentoDossie = Pick<
  Tables<"documentos">,
  | "id"
  | "tipo"
  | "status"
  | "origem"
  | "assinado_em"
  | "motivo_rejeicao"
  | "link_assinado"
>;
type MaterialDossie = Pick<
  Tables<"materiais">,
  "id" | "nome_arquivo" | "tipo" | "link_drive" | "adicionado_em"
>;
type FormularioDossie = Pick<
  Tables<"formularios">,
  "id" | "formulario_nome" | "respostas" | "respondido_em"
>;
type ReuniaoDossie = Pick<
  Tables<"reunioes">,
  "id" | "origem" | "data_hora" | "status" | "link"
>;
type TaskDossie = Pick<
  Tables<"tasks_asana">,
  "id" | "task_id" | "titulo" | "status" | "criado_em" | "concluido_em"
>;

/** Linha da aluna com as relações embutidas (resultado da query). */
export interface DossieRow extends AlunaBase {
  pagamentos?: PagamentoDossie[] | null;
  documentos?: DocumentoDossie[] | null;
  materiais?: MaterialDossie[] | null;
  formularios?: FormularioDossie[] | null;
  reunioes?: ReuniaoDossie[] | null;
  tasks_asana?: TaskDossie[] | null;
}

export interface Dossie {
  aluna: AlunaBase;
  pagamentos: {
    resumo: {
      total: number;
      por_status: Record<string, number>;
      em_atraso: boolean;
      valor_em_aberto: number;
    };
    itens: PagamentoDossie[];
  };
  documentos: {
    pendentes: DocumentoDossie[];
    assinados: DocumentoDossie[];
    rejeitados: DocumentoDossie[];
  };
  materiais_recentes: MaterialDossie[];
  ultimas_respostas_formulario: FormularioDossie[];
  proxima_reuniao: ReuniaoDossie | null;
  tasks_abertas: TaskDossie[];
}

const LIMITE_MATERIAIS = 10;
const LIMITE_FORMULARIOS = 5;

/** Timestamp em ms de uma string ISO; -Infinity quando ausente (fica por último). */
function tempo(iso: string | null): number {
  return iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY;
}

/** Ordena (cópia) do mais recente para o mais antigo por um campo de data. */
function maisRecentes<T>(itens: T[], campo: (item: T) => string | null): T[] {
  return [...itens].sort((a, b) => tempo(campo(b)) - tempo(campo(a)));
}

export function montarDossie(row: DossieRow, agora: Date = new Date()): Dossie {
  const pagamentos = row.pagamentos ?? [];
  const documentos = row.documentos ?? [];
  const materiais = row.materiais ?? [];
  const formularios = row.formularios ?? [];
  const reunioes = row.reunioes ?? [];
  const tasks = row.tasks_asana ?? [];

  // Pagamentos: resumo + lista.
  const por_status: Record<string, number> = {};
  for (const p of pagamentos) {
    por_status[p.status] = (por_status[p.status] ?? 0) + 1;
  }
  const emAberto = pagamentos.filter(
    (p) => p.status === "atrasado" || p.status === "pendente",
  );

  // Próxima reunião: a agendada mais próxima no futuro.
  const agoraMs = agora.getTime();
  const futuras = reunioes
    .map((r) => ({ r, t: r.data_hora ? Date.parse(r.data_hora) : Number.NaN }))
    .filter((x) => !Number.isNaN(x.t) && x.t >= agoraMs && x.r.status !== "cancelada")
    .sort((a, b) => a.t - b.t);

  return {
    aluna: {
      id: row.id,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      criado_em: row.criado_em,
      metadata: row.metadata,
    },
    pagamentos: {
      resumo: {
        total: pagamentos.length,
        por_status,
        em_atraso: pagamentos.some((p) => p.status === "atrasado"),
        valor_em_aberto: emAberto.reduce((soma, p) => soma + (p.valor ?? 0), 0),
      },
      itens: pagamentos,
    },
    documentos: {
      pendentes: documentos.filter((d) => d.status === "pendente"),
      assinados: documentos.filter((d) => d.status === "assinado"),
      rejeitados: documentos.filter((d) => d.status === "rejeitado"),
    },
    materiais_recentes: maisRecentes(materiais, (m) => m.adicionado_em).slice(
      0,
      LIMITE_MATERIAIS,
    ),
    ultimas_respostas_formulario: maisRecentes(formularios, (f) => f.respondido_em).slice(
      0,
      LIMITE_FORMULARIOS,
    ),
    proxima_reuniao: futuras[0]?.r ?? null,
    tasks_abertas: tasks.filter(
      (t) => t.status !== "concluida" && t.status !== "removida",
    ),
  };
}
