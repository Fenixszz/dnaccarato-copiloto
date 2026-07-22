import { obterSupabase } from "@/lib/db/supabase";
import { avaliarFuros, type Furo, type TipoDeFuro } from "@/lib/matching/furos";

// Priorização do briefing diário: dos furos de todas as alunas, escolhe os
// 2-3 mais urgentes e monta a mensagem do WhatsApp da Adriana.

export type FuroDeAluna = Furo & {
  aluna_id: string;
  aluna_nome: string;
};

// Heurística de urgência (menor = mais urgente): atraso de pagamento >
// documento parado > reunião não marcada > formulário sem follow-up >
// SLA de task estourado. Empate mantém a ordem de chegada (sort estável).
export const PRIORIDADE_DOS_FUROS: Record<TipoDeFuro, number> = {
  pagamento_atrasado: 1,
  pagou_sem_contrato_assinado: 2,
  assinou_sem_reuniao: 3,
  formulario_sem_followup: 4,
  task_parada: 5,
};

export const MAXIMO_DE_ITENS_NO_BRIEFING = 3;

export function priorizarFuros(furos: FuroDeAluna[]): FuroDeAluna[] {
  return [...furos]
    .sort((a, b) => PRIORIDADE_DOS_FUROS[a.tipo] - PRIORIDADE_DOS_FUROS[b.tipo])
    .slice(0, MAXIMO_DE_ITENS_NO_BRIEFING);
}

export function montarMensagemDeBriefing(todosOsFuros: FuroDeAluna[]): string {
  if (todosOsFuros.length === 0) {
    return "Bom dia, Adriana! Tudo em dia por aqui: nenhuma pendência hoje. ☀️";
  }

  const itens = priorizarFuros(todosOsFuros);
  const total = todosOsFuros.length;
  const cabecalho =
    total === 1 ? "Bom dia, Adriana. 1 coisa hoje:" : `Bom dia, Adriana. ${total} coisas hoje:`;
  const linhas = itens.map((furo, indice) => `${indice + 1}. ${furo.aluna_nome}: ${furo.detalhe}`);

  const restantes = total - itens.length;
  const rodape =
    restantes > 0
      ? [
          restantes === 1
            ? "(+1 pendência menos urgente fora da lista)"
            : `(+${restantes} pendências menos urgentes fora da lista)`,
        ]
      : [];

  return [cabecalho, ...linhas, ...rodape].join("\n");
}

// Coleta os furos de todas as alunas numa ÚNICA query embutida (sem N+1 —
// detectarFuros individual faria uma query por aluna).
export async function coletarFurosDeTodasAsAlunas(): Promise<FuroDeAluna[]> {
  const { data, error } = await obterSupabase()
    .from("alunas")
    .select(
      `id, nome,
       pagamentos ( status, valor, vencimento ),
       documentos ( tipo, status ),
       formularios ( formulario_nome, respondido_em ),
       reunioes ( status, data_hora ),
       tasks_asana ( titulo, criado_em, concluido_em )`
    )
    .order("nome");
  if (error) {
    throw new Error(`Falha ao coletar furos das alunas: ${error.message}`);
  }
  const agora = new Date();
  return (data ?? []).flatMap((aluna) =>
    avaliarFuros(
      {
        pagamentos: aluna.pagamentos ?? [],
        documentos: aluna.documentos ?? [],
        formularios: aluna.formularios ?? [],
        reunioes: aluna.reunioes ?? [],
        tasks_asana: aluna.tasks_asana ?? [],
      },
      agora
    ).map((furo) => ({ ...furo, aluna_id: aluna.id, aluna_nome: aluna.nome }))
  );
}

// Fluxo completo do briefing: coleta, prioriza e monta a mensagem.
export async function gerarBriefing(): Promise<{
  furos: FuroDeAluna[];
  itens: FuroDeAluna[];
  mensagem: string;
}> {
  const furos = await coletarFurosDeTodasAsAlunas();
  return { furos, itens: priorizarFuros(furos), mensagem: montarMensagemDeBriefing(furos) };
}
