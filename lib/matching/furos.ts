import { obterSupabase } from "@/lib/db/supabase";
import { pagamentoEstaPago } from "@/lib/dossie";
import { normalizarNome } from "@/lib/matching/nomes";

// Detector de furos operacionais: inconsistências entre sistemas que indicam
// que alguma etapa do fluxo da aluna ficou pra trás. Alimenta o briefing
// diário e o dashboard.

// ---------------------------------------------------------------------------
// Janelas configuráveis (ajuste aqui):
// Dias desde a resposta de um formulário sem nenhum follow-up registrado.
export const DIAS_SEM_FOLLOWUP_FORMULARIO = 5;
// Dias que uma task do Asana pode ficar aberta antes de contar como parada.
export const DIAS_TASK_PARADA = 7;
// ---------------------------------------------------------------------------

export type TipoDeFuro =
  "pagou_sem_contrato_assinado" | "assinou_sem_reuniao" | "formulario_sem_followup" | "task_parada";

export type Furo = {
  tipo: TipoDeFuro;
  detalhe: string;
};

export type DadosParaFuros = {
  pagamentos: Array<{ status: string }>;
  documentos: Array<{ tipo: string; status: string }>;
  formularios: Array<{ formulario_nome: string; respondido_em: string | null }>;
  reunioes: Array<{ status: string; data_hora: string }>;
  tasks_asana: Array<{ titulo: string; criado_em: string; concluido_em: string | null }>;
};

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

function diasEntre(inicio: Date, fim: Date): number {
  return (fim.getTime() - inicio.getTime()) / MILISSEGUNDOS_POR_DIA;
}

// Regra pura, sem banco: recebe os dados da aluna e o "agora" (injetado pra
// ser testável) e devolve a lista de furos.
export function avaliarFuros(dados: DadosParaFuros, agora: Date): Furo[] {
  const furos: Furo[] = [];

  // 1. Pagou mas não assinou contrato.
  const pagou = dados.pagamentos.some((pagamento) => pagamentoEstaPago(pagamento.status));
  const contratoAssinado = dados.documentos.some(
    (documento) =>
      documento.status === "assinado" && normalizarNome(documento.tipo).includes("contrato")
  );
  if (pagou && !contratoAssinado) {
    furos.push({
      tipo: "pagou_sem_contrato_assinado",
      detalhe: "tem pagamento confirmado e nenhum contrato assinado",
    });
  }

  // 2. Assinou documento mas não tem nenhuma reunião marcada (cancelada não
  //    conta como marcada).
  const assinouAlgumDocumento = dados.documentos.some(
    (documento) => documento.status === "assinado"
  );
  const temReuniaoMarcada = dados.reunioes.some((reuniao) => reuniao.status !== "cancelada");
  if (assinouAlgumDocumento && !temReuniaoMarcada) {
    furos.push({
      tipo: "assinou_sem_reuniao",
      detalhe: "assinou documento e não tem nenhuma reunião marcada",
    });
  }

  // 3. Formulário respondido há mais de X dias sem follow-up registrado
  //    depois da resposta (reunião não cancelada ou task criada).
  for (const formulario of dados.formularios) {
    if (formulario.respondido_em === null) {
      continue;
    }
    const respondidoEm = new Date(formulario.respondido_em);
    const diasSemResposta = diasEntre(respondidoEm, agora);
    if (diasSemResposta <= DIAS_SEM_FOLLOWUP_FORMULARIO) {
      continue;
    }
    const temFollowup =
      dados.reunioes.some(
        (reuniao) => reuniao.status !== "cancelada" && new Date(reuniao.data_hora) >= respondidoEm
      ) || dados.tasks_asana.some((task) => new Date(task.criado_em) >= respondidoEm);
    if (!temFollowup) {
      furos.push({
        tipo: "formulario_sem_followup",
        detalhe: `formulário "${formulario.formulario_nome}" respondido há ${Math.floor(diasSemResposta)} dias sem follow-up`,
      });
    }
  }

  // 4. Task do Asana aberta há mais de N dias.
  for (const task of dados.tasks_asana) {
    if (task.concluido_em !== null) {
      continue;
    }
    const diasAberta = diasEntre(new Date(task.criado_em), agora);
    if (diasAberta > DIAS_TASK_PARADA) {
      furos.push({
        tipo: "task_parada",
        detalhe: `task "${task.titulo}" aberta há ${Math.floor(diasAberta)} dias`,
      });
    }
  }

  return furos;
}

// Busca os dados da aluna numa única query embutida (sem N+1) e avalia.
export async function detectarFuros(alunaId: string): Promise<Furo[]> {
  const { data, error } = await obterSupabase()
    .from("alunas")
    .select(
      `id,
       pagamentos ( status ),
       documentos ( tipo, status ),
       formularios ( formulario_nome, respondido_em ),
       reunioes ( status, data_hora ),
       tasks_asana ( titulo, criado_em, concluido_em )`
    )
    .eq("id", alunaId)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao buscar dados para detectar furos: ${error.message}`);
  }
  if (data === null) {
    throw new Error(`Aluna ${alunaId} não encontrada`);
  }
  return avaliarFuros(
    {
      pagamentos: data.pagamentos ?? [],
      documentos: data.documentos ?? [],
      formularios: data.formularios ?? [],
      reunioes: data.reunioes ?? [],
      tasks_asana: data.tasks_asana ?? [],
    },
    new Date()
  );
}
