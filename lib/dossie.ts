import { obterSupabase } from "@/lib/db/supabase";

// Regras de negócio e montagem do dossiê da aluna (agregado servido por
// /api/alunas/[id]/dossie e pela tool MCP dossie_da_aluna).

export type PagamentoDoDossie = {
  id: string;
  status: string;
  valor: number;
  vencimento: string | null;
  pago_em: string | null;
};

// Status que contam como "pago" — cobre os nossos ("pago") e os do Asaas.
const STATUS_PAGOS = new Set(["pago", "received", "confirmed", "received_in_cash"]);

export function pagamentoEstaPago(status: string): boolean {
  return STATUS_PAGOS.has(status.trim().toLowerCase());
}

export type SituacaoDePagamentos = {
  situacao: "em_dia" | "atrasado" | "sem_registros";
  ultimo_pagamento_em: string | null;
  quantidade_em_atraso: number;
  total_em_atraso: number;
};

// Atrasado = não pago com vencimento anterior a hoje. Pendente com
// vencimento futuro é em dia.
export function situacaoDePagamentos(
  pagamentos: PagamentoDoDossie[],
  hoje: Date
): SituacaoDePagamentos {
  if (pagamentos.length === 0) {
    return {
      situacao: "sem_registros",
      ultimo_pagamento_em: null,
      quantidade_em_atraso: 0,
      total_em_atraso: 0,
    };
  }
  const dataDeHoje = hoje.toISOString().slice(0, 10);
  const atrasados = pagamentos.filter(
    (pagamento) =>
      !pagamentoEstaPago(pagamento.status) &&
      pagamento.vencimento !== null &&
      pagamento.vencimento < dataDeHoje
  );
  const datasDePagamento = pagamentos
    .map((pagamento) => pagamento.pago_em)
    .filter((data): data is string => data !== null)
    .sort();
  return {
    situacao: atrasados.length > 0 ? "atrasado" : "em_dia",
    ultimo_pagamento_em: datasDePagamento.at(-1) ?? null,
    quantidade_em_atraso: atrasados.length,
    total_em_atraso: atrasados.reduce((soma, pagamento) => soma + pagamento.valor, 0),
  };
}

// Monta o dossiê completo numa única query embutida (sem N+1). Retorna null
// se a aluna não existir; erro de banco estoura pra quem chamou tratar.
export async function montarDossie(alunaId: string) {
  const agora = new Date();
  const { data, error } = await obterSupabase()
    .from("alunas")
    .select(
      `id, nome, email, telefone, criado_em,
       pagamentos ( id, status, valor, vencimento, pago_em ),
       documentos ( id, tipo, status, assinado_em, link_drive ),
       formularios ( id, formulario_nome, respostas, respondido_em ),
       reunioes ( id, origem, data_hora, status, link ),
       tasks_asana ( id, task_id, titulo, status, criado_em )`
    )
    .eq("id", alunaId)
    // Reuniões: só a próxima (futura e não cancelada).
    .gte("reunioes.data_hora", agora.toISOString())
    .neq("reunioes.status", "cancelada")
    .order("data_hora", { referencedTable: "reunioes", ascending: true })
    .limit(1, { referencedTable: "reunioes" })
    // Pagamentos: os mais recentes bastam pro resumo e pro histórico.
    .order("vencimento", { referencedTable: "pagamentos", ascending: false })
    .limit(24, { referencedTable: "pagamentos" })
    // Formulários: últimas respostas.
    .order("respondido_em", { referencedTable: "formularios", ascending: false })
    .limit(5, { referencedTable: "formularios" })
    // Tasks: só as abertas.
    .is("tasks_asana.concluido_em", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao montar dossiê: ${error.message}`);
  }
  if (data === null) {
    return null;
  }

  // Relacionamentos podem não existir ainda (aluna recém-criada por um
  // webhook): tudo abaixo degrada pra listas vazias / null, nunca erro.
  const pagamentos = data.pagamentos ?? [];
  const documentos = data.documentos ?? [];

  return {
    aluna: {
      id: data.id,
      nome: data.nome,
      email: data.email,
      telefone: data.telefone,
      criado_em: data.criado_em,
    },
    pagamentos: {
      ...situacaoDePagamentos(pagamentos, agora),
      recentes: pagamentos,
    },
    documentos: {
      assinados: documentos.filter((documento) => documento.status === "assinado"),
      pendentes: documentos.filter((documento) => documento.status === "pendente"),
    },
    formularios: data.formularios ?? [],
    proxima_reuniao: (data.reunioes ?? [])[0] ?? null,
    tasks_abertas: data.tasks_asana ?? [],
  };
}
