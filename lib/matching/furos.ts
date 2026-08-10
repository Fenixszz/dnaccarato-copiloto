import { getServiceClient } from "@/lib/db/client";

/**
 * Detector de "furos" (gaps operacionais) de uma aluna.
 *
 * `detectarFuros(alunaId)` carrega os dados relacionados numa query só e chama
 * `avaliarFuros` — a função PURA que aplica as regras (testável sem banco).
 */

// --- Parâmetros configuráveis --------------------------------------------------
/** X — dias desde a resposta do formulário sem follow-up para virar furo. */
export const DIAS_FORMULARIO_SEM_FOLLOWUP = 5;
/** N — dias com a task do Asana aberta/parada para virar furo. */
export const DIAS_TASK_PARADA = 7;

const DIA_MS = 24 * 60 * 60 * 1000;

export type TipoFuro =
  | "assinatura_rejeitada"
  | "pagou_sem_contrato"
  | "assinou_sem_reuniao"
  | "formulario_sem_followup"
  | "task_parada";

export type Severidade = "critica" | "alta" | "media";

export interface Furo {
  tipo: TipoFuro;
  severidade: Severidade;
  mensagem: string;
  contexto: Record<string, unknown>;
}

// Menor rank = mais urgente (aparece primeiro).
const RANK_SEVERIDADE: Record<Severidade, number> = { critica: 0, alta: 1, media: 2 };

export interface DadosAlunaFuros {
  documentos?: { status: string; tipo: string; motivo_rejeicao: string | null }[] | null;
  pagamentos?: { status: string; valor: number }[] | null;
  reunioes?: { status: string | null; data_hora: string | null }[] | null;
  formularios?: { formulario_nome: string; respondido_em: string | null }[] | null;
  tasks_asana?:
    | {
        titulo: string;
        status: string | null;
        criado_em: string | null;
        concluido_em: string | null;
      }[]
    | null;
}

/** Aplica as regras de furo sobre os dados já carregados. Função pura. */
export function avaliarFuros(dados: DadosAlunaFuros, agora: Date = new Date()): Furo[] {
  const documentos = dados.documentos ?? [];
  const pagamentos = dados.pagamentos ?? [];
  const reunioes = dados.reunioes ?? [];
  const formularios = dados.formularios ?? [];
  const tasks = dados.tasks_asana ?? [];

  const furos: Furo[] = [];

  const temDocAssinado = documentos.some((d) => d.status === "assinado");
  const temPagamentoPago = pagamentos.some((p) => p.status === "pago");
  const temReuniaoAgendada = reunioes.some((r) => r.status === "agendada");

  // 1. Assinatura rejeitada — o mais urgente (contato imediato).
  for (const doc of documentos.filter((d) => d.status === "rejeitado")) {
    furos.push({
      tipo: "assinatura_rejeitada",
      severidade: "critica",
      mensagem: doc.motivo_rejeicao
        ? `Assinatura rejeitada: ${doc.motivo_rejeicao}. Precisa de contato imediato.`
        : "Assinatura rejeitada. Precisa de contato imediato.",
      contexto: { tipo: doc.tipo, motivo: doc.motivo_rejeicao },
    });
  }

  // 2. Pagou mas não assinou contrato.
  if (temPagamentoPago && !temDocAssinado) {
    furos.push({
      tipo: "pagou_sem_contrato",
      severidade: "alta",
      mensagem: "Pagou mas ainda não assinou o contrato.",
      contexto: {},
    });
  }

  // 3. Assinou mas não tem reunião marcada.
  if (temDocAssinado && !temReuniaoAgendada) {
    furos.push({
      tipo: "assinou_sem_reuniao",
      severidade: "alta",
      mensagem: "Assinou o contrato mas não tem reunião marcada.",
      contexto: {},
    });
  }

  // 4. Formulário respondido há mais de X dias sem follow-up.
  const respostas = formularios
    .map((f) => ({ f, t: f.respondido_em ? Date.parse(f.respondido_em) : Number.NaN }))
    .filter((x) => Number.isFinite(x.t));
  if (respostas.length > 0) {
    const maisRecente = respostas.reduce((a, b) => (b.t > a.t ? b : a));
    const dias = (agora.getTime() - maisRecente.t) / DIA_MS;
    const temFollowup = reunioes.some(
      (r) => r.data_hora != null && Date.parse(r.data_hora) >= maisRecente.t,
    );
    if (dias > DIAS_FORMULARIO_SEM_FOLLOWUP && !temFollowup) {
      furos.push({
        tipo: "formulario_sem_followup",
        severidade: "media",
        mensagem: `Respondeu "${maisRecente.f.formulario_nome}" há ${Math.floor(dias)} dias e não teve follow-up.`,
        contexto: { formulario: maisRecente.f.formulario_nome, dias: Math.floor(dias) },
      });
    }
  }

  // 5. Task do Asana parada há mais de N dias.
  for (const t of tasks) {
    const aberta =
      t.status !== "concluida" && t.status !== "removida" && t.concluido_em == null;
    if (!aberta || t.criado_em == null) continue;
    const dias = (agora.getTime() - Date.parse(t.criado_em)) / DIA_MS;
    if (dias > DIAS_TASK_PARADA) {
      furos.push({
        tipo: "task_parada",
        severidade: "media",
        mensagem: `Task "${t.titulo}" parada há ${Math.floor(dias)} dias.`,
        contexto: { titulo: t.titulo, dias: Math.floor(dias) },
      });
    }
  }

  // Ordena por urgência (rejeição fica no topo).
  furos.sort((a, b) => RANK_SEVERIDADE[a.severidade] - RANK_SEVERIDADE[b.severidade]);
  return furos;
}

const SELECT_FUROS = `
  id, nome,
  documentos ( status, tipo, motivo_rejeicao ),
  pagamentos ( status, valor ),
  reunioes ( status, data_hora ),
  formularios ( formulario_nome, respondido_em ),
  tasks_asana ( titulo, status, criado_em, concluido_em )
`;

/**
 * Detecta os furos de uma aluna. Carrega os dados relacionados numa única
 * query (sem N+1) e aplica `avaliarFuros`. Lança se a aluna não existir.
 */
export async function detectarFuros(alunaId: string): Promise<Furo[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("alunas")
    .select(SELECT_FUROS)
    .eq("id", alunaId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar dados da aluna: ${error.message}`);
  if (!data) throw new Error(`Aluna não encontrada: ${alunaId}`);

  return avaliarFuros(data as unknown as DadosAlunaFuros);
}

export interface AlunaComFuros {
  aluna: { id: string; nome: string };
  furos: Furo[];
}

/**
 * Detecta os furos de TODAS as alunas numa única query (sem N+1) — usado pelo
 * briefing diário.
 */
export async function detectarFurosDeTodas(
  agora: Date = new Date(),
): Promise<AlunaComFuros[]> {
  const db = getServiceClient();
  const { data, error } = await db.from("alunas").select(SELECT_FUROS);
  if (error) throw new Error(`Falha ao carregar alunas: ${error.message}`);

  const linhas = (data ?? []) as (DadosAlunaFuros & { id: string; nome: string })[];
  return linhas.map((row) => ({
    aluna: { id: row.id, nome: row.nome },
    furos: avaliarFuros(row, agora),
  }));
}
