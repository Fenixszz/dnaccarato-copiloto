import { obterSupabase } from "@/lib/db/supabase";
import { pagamentoEstaPago } from "@/lib/dossie";
import { cancelarAgendamentoCalendly } from "@/lib/integrations/calendly";
import { criarTaskAsana } from "@/lib/integrations/asana";
import { enviarMensagemWhatsApp, formatarNumeroWhatsApp } from "@/lib/whatsapp/evolution";
import { montarLembreteDePagamento } from "@/lib/whatsapp/mensagens";

// Núcleo das ações de escrita, compartilhado entre as tools MCP (Fase 4.3) e
// os botões de ação rápida do dashboard. Retorno neutro de UI: quem chama
// (MCP ou dashboard) adapta pra sua resposta. A auditoria é feita por fora
// (executarComAuditoria) — aqui só se executa a ação.

export type ResultadoEscrita = {
  status: "sucesso" | "recusa";
  // Resumo pra auditoria (o "resultado" da linha em log_auditoria).
  resultado: string;
  // Mensagem amigável pro usuário (recusa) ou resumo humano (sucesso).
  mensagem: string;
  // Payload estruturado (usado pela resposta JSON do MCP).
  dados: Record<string, unknown>;
  // aluna_id que vai pra auditoria; null quando o id não existe em alunas
  // (a FK de log_auditoria rejeitaria o valor).
  alunaIdAuditoria: string | null;
};

async function buscarAluna(
  alunaId: string
): Promise<{ id: string; nome: string; telefone: string | null } | null> {
  const { data, error } = await obterSupabase()
    .from("alunas")
    .select("id, nome, telefone")
    .eq("id", alunaId)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao buscar aluna: ${error.message}`);
  }
  return data;
}

export async function acaoEnviarLembretePagamento(alunaId: string): Promise<ResultadoEscrita> {
  const aluna = await buscarAluna(alunaId);
  if (!aluna) {
    return {
      status: "recusa",
      resultado: "recusado: aluna não encontrada",
      mensagem: `Nenhuma aluna com id ${alunaId}`,
      dados: {},
      alunaIdAuditoria: null,
    };
  }
  if (!aluna.telefone) {
    return {
      status: "recusa",
      resultado: "recusado: aluna sem telefone cadastrado",
      mensagem: `${aluna.nome} não tem telefone cadastrado — impossível enviar WhatsApp.`,
      dados: {},
      alunaIdAuditoria: alunaId,
    };
  }
  const numero = formatarNumeroWhatsApp(aluna.telefone);
  if (!numero) {
    return {
      status: "recusa",
      resultado: `recusado: telefone inválido (${aluna.telefone})`,
      mensagem: `O telefone cadastrado de ${aluna.nome} (${aluna.telefone}) não é um número válido de WhatsApp.`,
      dados: {},
      alunaIdAuditoria: alunaId,
    };
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const { data: pagamentos, error } = await obterSupabase()
    .from("pagamentos")
    .select("status, valor, vencimento")
    .eq("aluna_id", alunaId)
    .lt("vencimento", hoje);
  if (error) {
    throw new Error(`Falha ao buscar pagamentos: ${error.message}`);
  }
  const atrasados = (pagamentos ?? []).filter((pagamento) => !pagamentoEstaPago(pagamento.status));
  if (atrasados.length === 0) {
    return {
      status: "recusa",
      resultado: "recusado: nenhum pagamento atrasado",
      mensagem: `${aluna.nome} não tem pagamento atrasado — nenhum lembrete enviado.`,
      dados: {},
      alunaIdAuditoria: alunaId,
    };
  }

  const mensagem = montarLembreteDePagamento(aluna.nome, atrasados);
  await enviarMensagemWhatsApp(numero, mensagem);
  return {
    status: "sucesso",
    resultado: `lembrete enviado pra ${numero} (${atrasados.length} pagamento(s) em atraso)`,
    mensagem: `Lembrete enviado para ${aluna.nome}.`,
    dados: {
      enviado: true,
      aluna: aluna.nome,
      numero,
      pagamentos_em_atraso: atrasados.length,
      mensagem,
    },
    alunaIdAuditoria: alunaId,
  };
}

export async function acaoCriarTaskAsana(
  alunaId: string,
  titulo: string,
  descricao: string
): Promise<ResultadoEscrita> {
  const aluna = await buscarAluna(alunaId);
  if (!aluna) {
    return {
      status: "recusa",
      resultado: "recusado: aluna não encontrada",
      mensagem: `Nenhuma aluna com id ${alunaId}`,
      dados: {},
      alunaIdAuditoria: null,
    };
  }

  const tituloComAluna = `${titulo} — ${aluna.nome}`;
  const task = await criarTaskAsana(tituloComAluna, descricao);
  const { error } = await obterSupabase().from("tasks_asana").insert({
    aluna_id: alunaId,
    task_id: task.gid,
    titulo: tituloComAluna,
    status: "aberta",
  });
  if (error) {
    throw new Error(
      `Task ${task.gid} criada no Asana, mas falhou ao espelhar no banco: ${error.message}`
    );
  }
  return {
    status: "sucesso",
    resultado: `task ${task.gid} criada no Asana`,
    mensagem: `Task criada no Asana para ${aluna.nome}.`,
    dados: { criada: true, task_id: task.gid, titulo: tituloComAluna, url: task.url },
    alunaIdAuditoria: alunaId,
  };
}

export async function acaoRemarcarReuniao(
  alunaId: string,
  novoHorario: string
): Promise<ResultadoEscrita> {
  const aluna = await buscarAluna(alunaId);
  if (!aluna) {
    return {
      status: "recusa",
      resultado: "recusado: aluna não encontrada",
      mensagem: `Nenhuma aluna com id ${alunaId}`,
      dados: {},
      alunaIdAuditoria: null,
    };
  }

  const { data: reunioes, error } = await obterSupabase()
    .from("reunioes")
    .select("id, data_hora, referencia_externa")
    .eq("aluna_id", alunaId)
    .eq("origem", "calendly")
    .neq("status", "cancelada")
    .gte("data_hora", new Date().toISOString())
    .order("data_hora", { ascending: true })
    .limit(1);
  if (error) {
    throw new Error(`Falha ao buscar reuniões: ${error.message}`);
  }
  const reuniao = (reunioes ?? [])[0];
  if (!reuniao || !reuniao.referencia_externa) {
    return {
      status: "recusa",
      resultado: "recusado: nenhuma reunião futura do Calendly pra remarcar",
      mensagem: `${aluna.nome} não tem reunião futura do Calendly pra remarcar.`,
      dados: {},
      alunaIdAuditoria: alunaId,
    };
  }

  const novaData = new Date(novoHorario).toISOString();
  await cancelarAgendamentoCalendly(
    reuniao.referencia_externa,
    `Remarcada pela clínica para ${novaData}`
  );
  const { error: erroCancelamento } = await obterSupabase()
    .from("reunioes")
    .update({ status: "cancelada" })
    .eq("id", reuniao.id);
  if (erroCancelamento) {
    throw new Error(`Falha ao marcar reunião como cancelada: ${erroCancelamento.message}`);
  }
  const { error: erroNova } = await obterSupabase().from("reunioes").insert({
    aluna_id: alunaId,
    origem: "manual",
    data_hora: novaData,
    status: "agendada",
  });
  if (erroNova) {
    throw new Error(`Falha ao registrar a nova reunião: ${erroNova.message}`);
  }

  const aviso =
    "O Calendly não cria agendamento por API: o horário novo foi registrado internamente. Confirme com a aluna ou envie o link de agendamento pra ficar no calendário dela.";
  return {
    status: "sucesso",
    resultado: `reunião de ${reuniao.data_hora} cancelada no Calendly; nova registrada pra ${novaData}`,
    mensagem: `Reunião remarcada para ${novaData}. ${aviso}`,
    dados: {
      remarcada: true,
      aluna: aluna.nome,
      horario_anterior: reuniao.data_hora,
      novo_horario: novaData,
      aviso,
    },
    alunaIdAuditoria: alunaId,
  };
}
