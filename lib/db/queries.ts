import { getServiceClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { intervaloSemanaSP } from "@/lib/tempo";
import { montarDossie, type Dossie, type DossieRow } from "@/lib/dossie";
import type { AlunaLista } from "@/lib/alunas/busca";
import { FILTRO_MENTORADAS_VISIVEIS } from "@/lib/mentoradas/filtro";

export interface RegistroFalha {
  tipo: string;
  severidade: "baixa" | "media" | "alta" | "critica";
  mensagem: string;
  contexto?: Json;
}

/**
 * Registra uma falha operacional em `falhas_sistema`. Best-effort: não deixa
 * a falha de log derrubar a operação principal.
 */
export async function registrarFalhaSistema(registro: RegistroFalha): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.from("falhas_sistema").insert({
    tipo: registro.tipo,
    severidade: registro.severidade,
    mensagem: registro.mensagem,
    contexto: registro.contexto ?? {},
  });
  if (error !== null) {
    console.error(
      JSON.stringify({
        nivel: "error",
        timestamp: new Date().toISOString(),
        contexto: "registrarFalhaSistema",
        tipo: registro.tipo,
        erro: error.message,
      }),
    );
  }
}

/**
 * Lê um valor de estado de integração (ex: "drive_page_token"). Retorna null
 * se a chave não existe.
 */
export async function lerEstado(chave: string): Promise<Json | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("estado_integracoes")
    .select("valor")
    .eq("chave", chave)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler estado (${chave}): ${error.message}`);
  return data?.valor ?? null;
}

/** Grava (upsert) um valor de estado de integração. */
export async function salvarEstado(chave: string, valor: Json): Promise<void> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("estado_integracoes")
    .select("chave")
    .eq("chave", chave)
    .limit(1);
  if (error) throw new Error(`Falha ao ler estado (${chave}): ${error.message}`);

  if (data?.[0]) {
    const { error: eUp } = await db
      .from("estado_integracoes")
      .update({ valor })
      .eq("chave", chave);
    if (eUp) throw new Error(`Falha ao atualizar estado (${chave}): ${eUp.message}`);
  } else {
    const { error: eIns } = await db.from("estado_integracoes").insert({ chave, valor });
    if (eIns) throw new Error(`Falha ao inserir estado (${chave}): ${eIns.message}`);
  }
}

/**
 * Queries de acesso ao banco.
 *
 * Inclui o helper de auditoria exigido pelo CLAUDE.md: toda ação de escrita
 * (tools MCP, ações do dashboard, cron) grava na tabela `log_auditoria` —
 * de onde veio (origem), o quê (acao), sobre quem (aluna_id), resultado e quando.
 */

export interface RegistroAuditoria {
  /** De onde veio a ação: "mcp" | "dashboard" | "cron". */
  origem: "mcp" | "dashboard" | "cron";
  /** O que foi feito (ex: "criar_cobranca", "enviar_whatsapp"). */
  acao: string;
  /** Aluna afetada, se aplicável (uuid). Nulo quando a ação não é sobre uma aluna. */
  alunaId?: string;
  /** Resultado da ação: "sucesso" | "erro". */
  resultado: "sucesso" | "erro";
  /** Detalhes extras sem dados sensíveis (opcional). */
  detalhes?: Json;
}

/**
 * Grava um registro na tabela `log_auditoria`.
 * O timestamp ("quando") é preenchido pelo banco (default now()).
 */
export async function registrarAuditoria(registro: RegistroAuditoria): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.from("log_auditoria").insert({
    origem: registro.origem,
    acao: registro.acao,
    aluna_id: registro.alunaId ?? null,
    resultado: registro.resultado,
    detalhes: registro.detalhes ?? {},
  });

  if (error !== null) {
    // Falha de auditoria não deve ser silenciosa, mas também não deve derrubar
    // a operação principal — logamos com contexto e seguimos.
    console.error(
      JSON.stringify({
        nivel: "error",
        timestamp: new Date().toISOString(),
        contexto: "registrarAuditoria",
        acao: registro.acao,
        erro: error.message,
      }),
    );
  }
}

/** Totais exibidos nos cards da tela inicial do dashboard. */
export interface ResumoDashboard {
  /** Alunas cadastradas (hoje não há conceito de arquivamento → todas ativas). */
  alunasAtivas: number;
  /** Pagamentos com status "atrasado". */
  pagamentosEmAtraso: number;
  /** Documentos com status "pendente" ou "rejeitado" (precisam de ação). */
  documentosPendentesRejeitados: number;
  /** Reuniões com data_hora dentro da semana corrente (seg–dom, fuso SP). */
  reunioesDaSemana: number;
}

/**
 * Conta, em uma leva de queries `head + count` (sem trazer linhas), os totais
 * da tela inicial do dashboard. Usa a service_role (padrão do app: todo acesso
 * é via servidor); o gate de auth do layout garante que só Adriana/João chegam.
 * Lança com contexto se qualquer contagem falhar.
 */
export async function contarResumoDashboard(
  agora: Date = new Date(),
): Promise<ResumoDashboard> {
  const db = getServiceClient();
  const { inicio, fim } = intervaloSemanaSP(agora);

  const [alunas, atraso, documentos, reunioes] = await Promise.all([
    db
      .from("alunas")
      .select("*", { count: "exact", head: true })
      .or(FILTRO_MENTORADAS_VISIVEIS),
    db
      .from("pagamentos")
      .select("*", { count: "exact", head: true })
      .eq("status", "atrasado"),
    db
      .from("documentos")
      .select("*", { count: "exact", head: true })
      .in("status", ["pendente", "rejeitado"]),
    db
      .from("reunioes")
      .select("*", { count: "exact", head: true })
      .gte("data_hora", inicio)
      .lt("data_hora", fim),
  ]);

  for (const r of [alunas, atraso, documentos, reunioes]) {
    if (r.error !== null) {
      throw new Error(`Falha ao carregar resumo do dashboard: ${r.error.message}`);
    }
  }

  return {
    alunasAtivas: alunas.count ?? 0,
    pagamentosEmAtraso: atraso.count ?? 0,
    documentosPendentesRejeitados: documentos.count ?? 0,
    reunioesDaSemana: reunioes.count ?? 0,
  };
}

/**
 * Lista as alunas para a tela de lista (subconjunto do cadastro), ordenadas
 * por nome. A busca (nome/e-mail/telefone) é aplicada em memória por
 * `filtrarAlunas` — ver lib/alunas/busca.
 */
export async function listarAlunas(): Promise<AlunaLista[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("alunas")
    .select("id, nome, email, telefone, criado_em")
    .or(FILTRO_MENTORADAS_VISIVEIS)
    .order("nome", { ascending: true });
  if (error !== null) throw new Error(`Falha ao listar alunas: ${error.message}`);
  return (data ?? []) as AlunaLista[];
}

// Uma única query com as relações embutidas (PostgREST resolve tudo num request
// só — sem N+1). Colunas explícitas para não trafegar dados desnecessários.
export const SELECT_DOSSIE = `
  id, nome, email, telefone, criado_em, metadata,
  pagamentos ( id, origem, status, valor, vencimento, pago_em, referencia_externa ),
  documentos ( id, tipo, status, origem, assinado_em, motivo_rejeicao, link_assinado ),
  materiais ( id, nome_arquivo, tipo, link_drive, adicionado_em ),
  formularios ( id, formulario_nome, respostas, respondido_em ),
  reunioes ( id, origem, data_hora, status, link ),
  tasks_asana ( id, task_id, titulo, status, criado_em, concluido_em )
`;

/**
 * Carrega e monta o dossiê agregado de uma aluna. Retorna null se a aluna não
 * existe. Reaproveitado pela rota GET /api/alunas/[id]/dossie e pela tela de
 * detalhe. Lança com contexto em erro de banco.
 */
export async function carregarDossie(
  id: string,
  agora: Date = new Date(),
): Promise<Dossie | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("alunas")
    .select(SELECT_DOSSIE)
    .eq("id", id)
    .maybeSingle();
  if (error !== null) throw new Error(`Falha ao carregar dossiê: ${error.message}`);
  if (!data) return null;
  return montarDossie(data as unknown as DossieRow, agora);
}
