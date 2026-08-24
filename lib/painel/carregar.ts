/**
 * Loader do painel inicial: busca as linhas cruas, agrega as métricas (via
 * `agregarPainel`, puro/testado) e junta os extras que a home mostra —
 * reuniões da semana, próximas reuniões, furos por severidade e saldo.
 */
import { getServiceClient } from "@/lib/db/client";
import { intervaloSemanaSP } from "@/lib/tempo";
import { detectarFurosDeTodas } from "@/lib/matching/furos";
import { lerSaldo } from "@/lib/creditos";
import { agregarPainel, type MetricasPainel } from "@/lib/painel/metricas";

export interface ProximaReuniao {
  id: string;
  data_hora: string;
  aluna_nome: string;
}

export interface ResumoFuros {
  total: number;
  criticas: number;
  altas: number;
  medias: number;
}

export interface DadosPainel {
  metricas: MetricasPainel;
  reunioesSemana: number;
  proximasReunioes: ProximaReuniao[];
  furos: ResumoFuros;
  saldoCentavos: number;
}

export async function carregarPainelInicio(
  agora: Date = new Date(),
): Promise<DadosPainel> {
  const db = getServiceClient();
  const { inicio, fim } = intervaloSemanaSP(agora);
  const agoraIso = agora.toISOString();

  const [alunas, pagamentos, documentos, semana, proximas, furosPorAluna, saldo] =
    await Promise.all([
      db.from("alunas").select("criado_em"),
      db.from("pagamentos").select("status, valor, pago_em"),
      db.from("documentos").select("status"),
      db
        .from("reunioes")
        .select("*", { count: "exact", head: true })
        .gte("data_hora", inicio)
        .lt("data_hora", fim),
      db
        .from("reunioes")
        .select("id, data_hora, aluna:alunas(nome)")
        .gte("data_hora", agoraIso)
        .neq("status", "cancelada")
        .order("data_hora", { ascending: true })
        .limit(5),
      detectarFurosDeTodas(agora),
      lerSaldo(),
    ]);

  for (const r of [alunas, pagamentos, documentos, semana, proximas]) {
    if (r.error !== null) {
      throw new Error(`Falha ao carregar o painel: ${r.error.message}`);
    }
  }

  const metricas = agregarPainel(
    {
      alunas: (alunas.data ?? []) as { criado_em: string }[],
      pagamentos: (pagamentos.data ?? []) as {
        status: string;
        valor: number;
        pago_em: string | null;
      }[],
      documentos: (documentos.data ?? []) as { status: string }[],
    },
    agora,
  );

  // Normaliza o join da aluna (PostgREST devolve objeto pra relação to-one,
  // mas o tipo gerado pode vir como array — tratamos os dois).
  const proximasReunioes: ProximaReuniao[] = (
    (proximas.data ?? []) as {
      id: string;
      data_hora: string | null;
      aluna: { nome: string } | { nome: string }[] | null;
    }[]
  )
    .filter((r) => r.data_hora !== null)
    .map((r) => {
      const aluna = Array.isArray(r.aluna) ? r.aluna[0] : r.aluna;
      return {
        id: r.id,
        data_hora: r.data_hora as string,
        aluna_nome: aluna?.nome ?? "Aluna",
      };
    });

  const furos = furosPorAluna.reduce<ResumoFuros>(
    (acc, { furos: lista }) => {
      for (const f of lista) {
        acc.total += 1;
        if (f.severidade === "critica") acc.criticas += 1;
        else if (f.severidade === "alta") acc.altas += 1;
        else acc.medias += 1;
      }
      return acc;
    },
    { total: 0, criticas: 0, altas: 0, medias: 0 },
  );

  return {
    metricas,
    reunioesSemana: semana.count ?? 0,
    proximasReunioes,
    furos,
    saldoCentavos: saldo.saldoCentavos,
  };
}
