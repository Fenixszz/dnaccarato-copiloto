import { obterSupabase } from "@/lib/db/supabase";
import { pagamentoEstaPago } from "@/lib/dossie";

// Totais da tela inicial do dashboard. Roda no servidor com a service role
// (mesmo padrão do dossiê): a rota já está protegida pelo proxy, e assim não
// depende de policies de leitura por tabela.

export type ResumoDashboard = {
  alunas: number;
  pagamentosEmAtraso: number;
  documentosPendentes: number;
  reunioesDaSemana: number;
};

// Semana corrente (segunda 00:00 até a segunda seguinte, em UTC). Pura pra
// ser testável sem depender do relógio.
export function intervaloDaSemana(agora: Date): { inicio: string; fim: string } {
  const meiaNoite = new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())
  );
  // getUTCDay: 0=domingo..6=sábado. Dias desde a última segunda.
  const desdeSegunda = (meiaNoite.getUTCDay() + 6) % 7;
  const inicio = new Date(meiaNoite);
  inicio.setUTCDate(meiaNoite.getUTCDate() - desdeSegunda);
  const fim = new Date(inicio);
  fim.setUTCDate(inicio.getUTCDate() + 7);
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

export async function montarResumoDashboard(agora: Date = new Date()): Promise<ResumoDashboard> {
  const supabase = obterSupabase();
  const hoje = agora.toISOString().slice(0, 10);
  const semana = intervaloDaSemana(agora);

  const [alunas, documentos, reunioes, pagamentos] = await Promise.all([
    supabase.from("alunas").select("id", { count: "exact", head: true }),
    supabase
      .from("documentos")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente"),
    supabase
      .from("reunioes")
      .select("id", { count: "exact", head: true })
      .gte("data_hora", semana.inicio)
      .lt("data_hora", semana.fim)
      .neq("status", "cancelada"),
    // Candidatos a atraso: vencidos. O filtro de "não pago" (que cobre vários
    // status) é aplicado em JS, reusando pagamentoEstaPago.
    supabase.from("pagamentos").select("status").lt("vencimento", hoje),
  ]);

  for (const resultado of [alunas, documentos, reunioes, pagamentos]) {
    if (resultado.error) {
      throw new Error(`Falha ao montar resumo do dashboard: ${resultado.error.message}`);
    }
  }

  const pagamentosEmAtraso = (pagamentos.data ?? []).filter(
    (pagamento) => !pagamentoEstaPago(pagamento.status)
  ).length;

  return {
    alunas: alunas.count ?? 0,
    documentosPendentes: documentos.count ?? 0,
    reunioesDaSemana: reunioes.count ?? 0,
    pagamentosEmAtraso,
  };
}
