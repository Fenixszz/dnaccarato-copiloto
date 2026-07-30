/**
 * Seed de dados fictícios para desenvolvimento.
 *
 * Cria 6 alunas cobrindo os cenários que o copiloto precisa detectar, mais
 * registros relacionados (pagamentos, documentos, reuniões, formulários,
 * tasks) e alguns materiais no Drive.
 *
 * Uso:  npm run seed
 * Requer: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.
 *
 * É idempotente: remove o seed anterior (identificado por email @seed.local /
 * metadata.seed = true) antes de recriar. Usa a service_role, que ignora RLS.
 */
import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "../lib/env";
import type { Database, TablesInsert } from "../lib/db/types";

// Cliente lazy: criado só dentro do main(), para que a ausência de env caia no
// catch e vire uma mensagem clara, em vez de exceção não capturada no load.
let clienteSupabase: SupabaseClient<Database> | null = null;
function getDb(): SupabaseClient<Database> {
  if (clienteSupabase === null) {
    clienteSupabase = createClient<Database>(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return clienteSupabase;
}

/** ISO de agora deslocado por N dias (N negativo = futuro). */
function diasAtras(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

const DOMINIO_SEED = "@seed.local";

async function limparSeedAnterior(): Promise<void> {
  const { data: alunas, error } = await getDb()
    .from("alunas")
    .select("id")
    .like("email", `%${DOMINIO_SEED}`);
  if (error) throw new Error(`Falha ao buscar seed anterior: ${error.message}`);

  const ids = (alunas ?? []).map((a) => a.id);
  if (ids.length === 0) return;

  // Ordem importa: as FKs são ON DELETE RESTRICT, então os filhos primeiro.
  for (const tabela of [
    "materiais",
    "formularios",
    "reunioes",
    "tasks_asana",
    "documentos",
    "pagamentos",
  ] as const) {
    const { error: eDel } = await getDb().from(tabela).delete().in("aluna_id", ids);
    if (eDel) throw new Error(`Falha ao limpar ${tabela}: ${eDel.message}`);
  }
  const { error: eAlunas } = await getDb().from("alunas").delete().in("id", ids);
  if (eAlunas) throw new Error(`Falha ao limpar alunas: ${eAlunas.message}`);

  console.log(`🧹 Seed anterior removido (${ids.length} alunas).`);
}

async function inserirAlunas(): Promise<Record<string, string>> {
  const alunas: TablesInsert<"alunas">[] = [
    {
      nome: "Ana Prado",
      email: `ana${DOMINIO_SEED}`,
      telefone: "+55 11 90000-0001",
      metadata: { seed: true, cenario: "em_dia" },
    },
    {
      nome: "Bruna Lima",
      email: `bruna${DOMINIO_SEED}`,
      telefone: "+55 11 90000-0002",
      metadata: { seed: true, cenario: "pagamento_atrasado" },
    },
    {
      nome: "Carla Souza",
      email: `carla${DOMINIO_SEED}`,
      telefone: "+55 11 90000-0003",
      metadata: { seed: true, cenario: "assinou_sem_reuniao" },
    },
    {
      nome: "Daniela Rocha",
      email: `daniela${DOMINIO_SEED}`,
      telefone: "+55 11 90000-0004",
      metadata: { seed: true, cenario: "formulario_sem_followup" },
    },
    {
      nome: "Eduarda Nunes",
      email: `eduarda${DOMINIO_SEED}`,
      telefone: "+55 11 90000-0005",
      metadata: { seed: true, cenario: "task_asana_parada" },
    },
    {
      nome: "Fernanda Alves",
      email: `fernanda${DOMINIO_SEED}`,
      telefone: "+55 11 90000-0006",
      metadata: { seed: true, cenario: "assinatura_rejeitada" },
    },
  ];

  const { data, error } = await getDb().from("alunas").insert(alunas).select("id, email");
  if (error) throw new Error(`Falha ao inserir alunas: ${error.message}`);

  const porEmail: Record<string, string> = {};
  for (const linha of data ?? []) {
    if (linha.email) porEmail[linha.email] = linha.id;
  }
  return porEmail;
}

async function inserir<T extends keyof Database["public"]["Tables"]>(
  tabela: T,
  linhas: TablesInsert<T>[],
): Promise<void> {
  if (linhas.length === 0) return;
  // O tipo genérico de insert do supabase-js não estreita bem com T dinâmico;
  // as linhas já são TablesInsert<T> corretas (validadas na montagem abaixo).
  const { error } = await getDb()
    .from(tabela)
    .insert(linhas as never);
  if (error) throw new Error(`Falha ao inserir em ${String(tabela)}: ${error.message}`);
}

/** Retorna o id da aluna pelo email, ou lança se não foi inserida. */
function idDe(mapa: Record<string, string>, email: string): string {
  const id = mapa[email];
  if (id === undefined) throw new Error(`Aluna não inserida: ${email}`);
  return id;
}

async function main(): Promise<void> {
  await limparSeedAnterior();
  const id = await inserirAlunas();
  const ana = idDe(id, `ana${DOMINIO_SEED}`);
  const bruna = idDe(id, `bruna${DOMINIO_SEED}`);
  const carla = idDe(id, `carla${DOMINIO_SEED}`);
  const daniela = idDe(id, `daniela${DOMINIO_SEED}`);
  const eduarda = idDe(id, `eduarda${DOMINIO_SEED}`);
  const fernanda = idDe(id, `fernanda${DOMINIO_SEED}`);

  // Pagamentos -------------------------------------------------------------
  await inserir("pagamentos", [
    {
      aluna_id: ana,
      origem: "asaas",
      status: "pago",
      valor: 500,
      vencimento: diasAtras(30),
      pago_em: diasAtras(28),
      referencia_externa: "seed-ana-pg",
    },
    {
      aluna_id: bruna,
      origem: "asaas",
      status: "atrasado",
      valor: 500,
      vencimento: diasAtras(12),
      pago_em: null,
      referencia_externa: "seed-bruna-pg",
    },
    {
      aluna_id: carla,
      origem: "asaas",
      status: "pago",
      valor: 500,
      vencimento: diasAtras(20),
      pago_em: diasAtras(19),
      referencia_externa: "seed-carla-pg",
    },
    {
      aluna_id: daniela,
      origem: "asaas",
      status: "pago",
      valor: 500,
      vencimento: diasAtras(15),
      pago_em: diasAtras(15),
      referencia_externa: "seed-daniela-pg",
    },
    {
      aluna_id: eduarda,
      origem: "asaas",
      status: "pago",
      valor: 500,
      vencimento: diasAtras(10),
      pago_em: diasAtras(9),
      referencia_externa: "seed-eduarda-pg",
    },
    {
      aluna_id: fernanda,
      origem: "asaas",
      status: "pendente",
      valor: 500,
      vencimento: diasAtras(-5),
      pago_em: null,
      referencia_externa: "seed-fernanda-pg",
    },
  ]);

  // Documentos -------------------------------------------------------------
  await inserir("documentos", [
    {
      aluna_id: ana,
      tipo: "contrato",
      status: "assinado",
      documento_id_externo: "seed-ana-doc",
      assinado_em: diasAtras(25),
      link_assinado: "https://autentique.exemplo/ana",
    },
    {
      aluna_id: carla,
      tipo: "contrato",
      status: "assinado",
      documento_id_externo: "seed-carla-doc",
      assinado_em: diasAtras(18),
      link_assinado: "https://autentique.exemplo/carla",
    },
    {
      aluna_id: daniela,
      tipo: "contrato",
      status: "assinado",
      documento_id_externo: "seed-daniela-doc",
      assinado_em: diasAtras(14),
      link_assinado: "https://autentique.exemplo/daniela",
    },
    {
      aluna_id: fernanda,
      tipo: "contrato",
      status: "rejeitado",
      documento_id_externo: "seed-fernanda-doc",
      motivo_rejeicao: "Dados divergentes no documento enviado",
    },
  ]);

  // Reuniões (Ana em dia tem reunião; Carla assinou mas NÃO tem) -----------
  await inserir("reunioes", [
    {
      aluna_id: ana,
      origem: "calendly",
      status: "agendada",
      data_hora: diasAtras(-3),
      link: "https://calendly.exemplo/ana",
    },
  ]);

  // Formulários (Daniela respondeu há >5 dias e não teve follow-up) --------
  await inserir("formularios", [
    {
      aluna_id: ana,
      formulario_nome: "Onboarding",
      respostas: { objetivo: "Aprovação concurso" },
      respondido_em: diasAtras(2),
    },
    {
      aluna_id: daniela,
      formulario_nome: "Onboarding",
      respostas: { objetivo: "Reforço de matemática" },
      respondido_em: diasAtras(6),
    },
  ]);

  // Tasks Asana (Eduarda com task parada há tempo) -------------------------
  await inserir("tasks_asana", [
    {
      aluna_id: eduarda,
      task_id: "seed-asana-eduarda-1",
      titulo: "Enviar material de boas-vindas",
      status: "em_andamento",
      criado_em: diasAtras(20),
      concluido_em: null,
    },
    {
      aluna_id: ana,
      task_id: "seed-asana-ana-1",
      titulo: "Confirmar dados cadastrais",
      status: "concluida",
      criado_em: diasAtras(24),
      concluido_em: diasAtras(22),
    },
  ]);

  // Materiais no Drive (3 para a Ana) --------------------------------------
  await inserir("materiais", [
    {
      aluna_id: ana,
      nome_arquivo: "Contrato assinado.pdf",
      tipo: "application/pdf",
      link_drive: "https://drive.exemplo/ana/contrato",
    },
    {
      aluna_id: ana,
      nome_arquivo: "Plano de estudos.pdf",
      tipo: "application/pdf",
      link_drive: "https://drive.exemplo/ana/plano",
    },
    {
      aluna_id: ana,
      nome_arquivo: "Cronograma.xlsx",
      tipo: "application/vnd.ms-excel",
      link_drive: "https://drive.exemplo/ana/cronograma",
    },
  ]);

  console.log("✅ Seed concluído: 6 alunas + relacionados + 3 materiais (Ana).");
}

main().catch((erro: unknown) => {
  console.error("❌ Seed falhou:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
