// Seed do banco de teste: 5 alunas fictícias cobrindo os principais estados
// que o copiloto precisa detectar. Re-rodável: apaga o seed anterior
// (marcado com metadata.seed = true) antes de inserir de novo.
//
// Uso: npm run seed  (exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local)
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/db/types";

function criarCliente() {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no .env.local (veja .env.example)"
    );
  }
  return createClient<Database>(url, chave);
}

function diasAtras(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

function diasAdiante(dias: number): string {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
}

function dataAtras(dias: number): string {
  return diasAtras(dias).slice(0, 10);
}

type Supabase = ReturnType<typeof criarCliente>;

async function limparSeedAnterior(supabase: Supabase): Promise<void> {
  const { data: alunasSeed, error } = await supabase
    .from("alunas")
    .select("id")
    .contains("metadata", { seed: true });
  if (error) {
    throw new Error(`Falha ao buscar seed anterior: ${error.message}`);
  }
  if (!alunasSeed || alunasSeed.length === 0) {
    return;
  }
  const ids = alunasSeed.map((aluna) => aluna.id);

  // Filhas primeiro: as FKs são ON DELETE RESTRICT.
  const tabelasFilhas = [
    "pagamentos",
    "documentos",
    "formularios",
    "reunioes",
    "tasks_asana",
    "briefings_enviados",
    "log_auditoria",
  ] as const;
  for (const tabela of tabelasFilhas) {
    const { error: erroFilha } = await supabase.from(tabela).delete().in("aluna_id", ids);
    if (erroFilha) {
      throw new Error(`Falha ao limpar ${tabela}: ${erroFilha.message}`);
    }
  }
  const { error: erroAlunas } = await supabase.from("alunas").delete().in("id", ids);
  if (erroAlunas) {
    throw new Error(`Falha ao limpar alunas: ${erroAlunas.message}`);
  }
  console.log(`Seed anterior removido (${ids.length} alunas e registros vinculados).`);
}

async function inserirAluna(
  supabase: Supabase,
  nome: string,
  email: string,
  telefone: string,
  cenario: string
): Promise<string> {
  const { data, error } = await supabase
    .from("alunas")
    .insert({ nome, email, telefone, metadata: { seed: true, cenario } })
    .select("id")
    .single();
  if (error) {
    throw new Error(`Falha ao inserir aluna ${nome}: ${error.message}`);
  }
  return data.id;
}

function garantirInsercao(tabela: string, error: { message: string } | null): void {
  if (error) {
    throw new Error(`Falha ao inserir em ${tabela}: ${error.message}`);
  }
}

async function main(): Promise<void> {
  const supabase = criarCliente();
  await limparSeedAnterior(supabase);

  // 1. Em dia com tudo: pagou, assinou, tem reunião futura, formulário com
  //    follow-up recente e task concluída. Não deve gerar alerta nenhum.
  const ana = await inserirAluna(
    supabase,
    "Ana Paula Ribeiro",
    "ana.seed@example.com",
    "+55 11 91111-0001",
    "em_dia"
  );
  garantirInsercao(
    "pagamentos",
    (
      await supabase.from("pagamentos").insert({
        aluna_id: ana,
        origem: "asaas",
        status: "pago",
        valor: 1200,
        vencimento: dataAtras(3),
        pago_em: diasAtras(3),
        referencia_externa: "seed_pay_ana_001",
      })
    ).error
  );
  garantirInsercao(
    "documentos",
    (
      await supabase.from("documentos").insert({
        aluna_id: ana,
        tipo: "contrato",
        status: "assinado",
        assinado_em: diasAtras(10),
        link_drive: "https://drive.google.com/seed/contrato-ana",
      })
    ).error
  );
  garantirInsercao(
    "reunioes",
    (
      await supabase.from("reunioes").insert({
        aluna_id: ana,
        origem: "calendly",
        data_hora: diasAdiante(2),
        status: "confirmada",
        link: "https://calendly.com/seed/reuniao-ana",
      })
    ).error
  );
  garantirInsercao(
    "formularios",
    (
      await supabase.from("formularios").insert({
        aluna_id: ana,
        formulario_nome: "anamnese",
        respostas: { objetivo: "acompanhamento" },
        respondido_em: diasAtras(1),
      })
    ).error
  );
  garantirInsercao(
    "tasks_asana",
    (
      await supabase.from("tasks_asana").insert({
        aluna_id: ana,
        task_id: "seed_task_ana_001",
        titulo: "Preparar plano da Ana",
        status: "concluida",
        concluido_em: diasAtras(2),
      })
    ).error
  );

  // 2. Pagamento atrasado: venceu há 10 dias e segue pendente.
  const beatriz = await inserirAluna(
    supabase,
    "Beatriz Lima",
    "beatriz.seed@example.com",
    "+55 11 91111-0002",
    "pagamento_atrasado"
  );
  garantirInsercao(
    "pagamentos",
    (
      await supabase.from("pagamentos").insert({
        aluna_id: beatriz,
        origem: "asaas",
        status: "pendente",
        valor: 1200,
        vencimento: dataAtras(10),
        pago_em: null,
        referencia_externa: "seed_pay_beatriz_001",
      })
    ).error
  );

  // 3. Assinou documento mas não tem reunião marcada (nenhum registro em
  //    reunioes de propósito).
  const carla = await inserirAluna(
    supabase,
    "Carla Mendes",
    "carla.seed@example.com",
    "+55 11 91111-0003",
    "sem_reuniao_apos_assinatura"
  );
  garantirInsercao(
    "documentos",
    (
      await supabase.from("documentos").insert({
        aluna_id: carla,
        tipo: "contrato",
        status: "assinado",
        assinado_em: diasAtras(4),
        link_drive: "https://drive.google.com/seed/contrato-carla",
      })
    ).error
  );

  // 4. Respondeu formulário há 7 dias e ninguém deu follow-up (sem reunião e
  //    sem task depois da resposta).
  const daniela = await inserirAluna(
    supabase,
    "Daniela Souza",
    "daniela.seed@example.com",
    "+55 11 91111-0004",
    "formulario_sem_followup"
  );
  garantirInsercao(
    "formularios",
    (
      await supabase.from("formularios").insert({
        aluna_id: daniela,
        formulario_nome: "anamnese",
        respostas: { objetivo: "emagrecimento", restricoes: "nenhuma" },
        respondido_em: diasAtras(7),
      })
    ).error
  );

  // 5. Task do Asana parada: aberta há 12 dias, sem conclusão.
  const elisa = await inserirAluna(
    supabase,
    "Elisa Ferreira",
    "elisa.seed@example.com",
    "+55 11 91111-0005",
    "task_asana_parada"
  );
  garantirInsercao(
    "tasks_asana",
    (
      await supabase.from("tasks_asana").insert({
        aluna_id: elisa,
        task_id: "seed_task_elisa_001",
        titulo: "Montar protocolo da Elisa",
        status: "em_andamento",
        criado_em: diasAtras(12),
        concluido_em: null,
      })
    ).error
  );

  console.log("Seed concluído: 5 alunas fictícias inseridas.");
  console.log("Cenários: em_dia, pagamento_atrasado, sem_reuniao_apos_assinatura,");
  console.log("          formulario_sem_followup, task_asana_parada");
}

main().catch((erro: unknown) => {
  console.error(`Seed falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exit(1);
});
