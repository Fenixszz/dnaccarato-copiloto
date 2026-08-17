import { getServiceClient } from "@/lib/db/client";

/**
 * Anonimização de aluna (LGPD) — atendimento ao direito de eliminação da titular.
 *
 * DESENHO (ver RETENCAO.md): não apagamos a linha da aluna. `pagamentos` e
 * `documentos` têm FK `on delete restrict` porque são registros com obrigação
 * de retenção (financeira/legal); apagá-los violaria a constraint e a lei. Em vez
 * disso fazemos ANONIMIZAÇÃO EM VIGOR:
 *
 *  - Tabelas-filho com PII e SEM obrigação de retenção → apagadas
 *    (materiais, formularios, reunioes, tasks_asana).
 *  - Registros retidos → mantidos, mas com os campos de PII em texto livre
 *    limpos (documentos.link_assinado / motivo_rejeicao). `pagamentos` não tem
 *    coluna de PII pessoal (só valor/status/vencimento/referência) → mantido.
 *  - Linha da aluna → nome vira rótulo neutro; e-mail, telefone e metadata
 *    (onde mora o CPF) zerados; `anonimizada_em` carimbado.
 *  - `log_auditoria` (append-only) sobrevive: a própria anonimização é auditada
 *    pela rota. `eventos_brutos` não tem FK por aluna → coberto pela retenção
 *    por tempo (RETENCAO.md), não por este fluxo.
 *
 * Idempotente: se a aluna já está anonimizada, não faz nada e sinaliza.
 */

/** Rótulo que substitui o nome da aluna após a anonimização. */
export const NOME_ANONIMIZADO = "Aluna removida";

/** Resultado da anonimização, usado na resposta da rota e na auditoria. */
export interface ResultadoAnonimizacao {
  /** true se a aluna existia e foi anonimizada agora. */
  anonimizada: boolean;
  /** true se a aluna já estava anonimizada (operação idempotente, no-op). */
  jaAnonimizada: boolean;
  /** Quantas linhas foram removidas por tabela-filho. */
  removidos: {
    materiais: number;
    formularios: number;
    reunioes: number;
    tasks_asana: number;
  };
  /** Quantos documentos tiveram os campos de PII limpos (mantidos por retenção). */
  documentosLimpos: number;
}

/** Erro de negócio: aluna não encontrada (rota traduz para 404). */
export class AlunaNaoEncontrada extends Error {
  constructor(alunaId: string) {
    super(`Aluna não encontrada: ${alunaId}`);
    this.name = "AlunaNaoEncontrada";
  }
}

/** Tabelas-filho apagadas por completo (PII sem obrigação de retenção). */
const TABELAS_APAGADAS = ["materiais", "formularios", "reunioes", "tasks_asana"] as const;

/**
 * Anonimiza a aluna `alunaId` em todas as tabelas relacionadas.
 * Lança `AlunaNaoEncontrada` se a aluna não existe. Lança `Error` com contexto
 * se qualquer passo de banco falhar (a rota trata e audita como "erro").
 */
export async function anonimizarAluna(alunaId: string): Promise<ResultadoAnonimizacao> {
  const db = getServiceClient();

  // --- A aluna existe? Já foi anonimizada? ---
  const { data: aluna, error: eBusca } = await db
    .from("alunas")
    .select("id, anonimizada_em")
    .eq("id", alunaId)
    .maybeSingle();
  if (eBusca !== null) {
    throw new Error(`Falha ao buscar aluna para anonimizar: ${eBusca.message}`);
  }
  if (aluna === null) {
    throw new AlunaNaoEncontrada(alunaId);
  }
  if (aluna.anonimizada_em !== null) {
    return {
      anonimizada: false,
      jaAnonimizada: true,
      removidos: { materiais: 0, formularios: 0, reunioes: 0, tasks_asana: 0 },
      documentosLimpos: 0,
    };
  }

  // --- 1) Apaga as tabelas-filho com PII e sem retenção ---
  const removidos = { materiais: 0, formularios: 0, reunioes: 0, tasks_asana: 0 };
  for (const tabela of TABELAS_APAGADAS) {
    const { data, error } = await db
      .from(tabela)
      .delete()
      .eq("aluna_id", alunaId)
      .select("id");
    if (error !== null) {
      throw new Error(`Falha ao apagar ${tabela} da aluna: ${error.message}`);
    }
    removidos[tabela] = data?.length ?? 0;
  }

  // --- 2) Limpa a PII em texto livre dos documentos retidos (mantém a prova
  //         legal: tipo, status, assinado_em, id externo) ---
  const { data: docsLimpos, error: eDocs } = await db
    .from("documentos")
    .update({ link_assinado: null, motivo_rejeicao: null })
    .eq("aluna_id", alunaId)
    .select("id");
  if (eDocs !== null) {
    throw new Error(`Falha ao limpar documentos da aluna: ${eDocs.message}`);
  }

  // --- 3) Anonimiza a própria linha da aluna (zera CPF em metadata, contatos,
  //         nome) e carimba a marca de anonimização ---
  const { error: eAluna } = await db
    .from("alunas")
    .update({
      nome: NOME_ANONIMIZADO,
      email: null,
      telefone: null,
      metadata: {},
      anonimizada_em: new Date().toISOString(),
    })
    .eq("id", alunaId);
  if (eAluna !== null) {
    throw new Error(`Falha ao anonimizar a aluna: ${eAluna.message}`);
  }

  return {
    anonimizada: true,
    jaAnonimizada: false,
    removidos,
    documentosLimpos: docsLimpos?.length ?? 0,
  };
}
