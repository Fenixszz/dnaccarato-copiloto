import { obterSupabase } from "@/lib/db/supabase";
import type { Json } from "@/lib/db/types";
import { encontrarPorContato } from "@/lib/matching/contatos";
import { normalizarNome } from "@/lib/matching/nomes";
import type { EventoForms, RespostaDePergunta } from "@/lib/validation/forms";
import { jaProcessado, marcarProcessado } from "@/lib/webhooks/idempotency";

const ORIGEM = "forms";

export type ContatosExtraidos = {
  nome: string | null;
  emails: string[];
  telefones: string[];
};

// O formulário de anamnese pede nome/email/telefone como perguntas. Extrai
// esses campos pelo título da pergunta (sem depender da ordem), somando o
// email de login quando o Form coleta.
export function extrairContatos(
  respostas: RespostaDePergunta[],
  emailRespondente?: string | null
): ContatosExtraidos {
  const emails: string[] = [];
  const telefones: string[] = [];
  let nome: string | null = null;

  if (emailRespondente && emailRespondente.trim() !== "") {
    emails.push(emailRespondente);
  }
  for (const item of respostas) {
    const pergunta = normalizarNome(item.pergunta);
    const resposta = item.resposta.trim();
    if (resposta === "") {
      continue;
    }
    if (pergunta.includes("mail")) {
      emails.push(resposta);
    } else if (/telefone|celular|whatsapp|fone/.test(pergunta)) {
      telefones.push(resposta);
    } else if (nome === null && pergunta.includes("nome")) {
      nome = resposta;
    }
  }
  return { nome, emails, telefones };
}

async function salvarEventoBruto(payloadCru: unknown): Promise<void> {
  const { error } = await obterSupabase()
    .from("eventos_brutos")
    .insert({
      origem: ORIGEM,
      // A rota só chega aqui com corpo que veio de JSON.parse.
      payload: payloadCru as Json,
    });
  if (error) {
    throw new Error(`Falha ao salvar evento bruto: ${error.message}`);
  }
}

async function encontrarOuCriarAluna(contatos: ContatosExtraidos): Promise<string> {
  const { data: alunas, error } = await obterSupabase()
    .from("alunas")
    .select("id, nome, email, telefone");
  if (error) {
    throw new Error(`Falha ao listar alunas para matching: ${error.message}`);
  }
  const lista = alunas ?? [];
  for (const email of contatos.emails) {
    const porEmail = encontrarPorContato(lista, email, []);
    if (porEmail) {
      return porEmail.id;
    }
  }
  const porTelefone = encontrarPorContato(lista, null, contatos.telefones);
  if (porTelefone) {
    return porTelefone.id;
  }

  const { data, error: erroCriacao } = await obterSupabase()
    .from("alunas")
    .insert({
      nome: contatos.nome ?? contatos.emails[0] ?? "Não identificada (formulário)",
      email: contatos.emails[0] ?? null,
      telefone: contatos.telefones[0] ?? null,
      metadata: { origem_cadastro: "webhook_forms" },
    })
    .select("id")
    .single();
  if (erroCriacao) {
    throw new Error(`Falha ao criar aluna: ${erroCriacao.message}`);
  }
  return data.id;
}

async function gravarFormulario(evento: EventoForms, alunaId: string): Promise<void> {
  const { error } = await obterSupabase()
    .from("formularios")
    .upsert(
      {
        aluna_id: alunaId,
        formulario_nome: evento.formulario_nome,
        respostas: evento.respostas as Json,
        respondido_em: evento.respondido_em,
        referencia_externa: evento.resposta_id,
      },
      { onConflict: "referencia_externa" }
    );
  if (error) {
    throw new Error(`Falha ao gravar formulário ${evento.resposta_id}: ${error.message}`);
  }
}

export type ResultadoProcessamento = {
  status: "duplicado" | "processado";
  resumo: string;
};

// Fluxo completo de uma resposta de formulário. A rota já validou token e
// payload; erro em qualquer etapa estoura pra rota responder 500 SEM marcar
// como processado (a falha fica visível em Execuções no Apps Script).
export async function processarEventoForms(
  evento: EventoForms,
  payloadCru: unknown
): Promise<ResultadoProcessamento> {
  if (await jaProcessado(ORIGEM, evento.resposta_id)) {
    return { status: "duplicado", resumo: "resposta já processada, entrega repetida ignorada" };
  }

  await salvarEventoBruto(payloadCru);

  const contatos = extrairContatos(evento.respostas, evento.email);
  const alunaId = await encontrarOuCriarAluna(contatos);
  await gravarFormulario(evento, alunaId);

  await marcarProcessado(ORIGEM, evento.resposta_id, `formulário gravado para aluna ${alunaId}`);
  return {
    status: "processado",
    resumo: `resposta ${evento.resposta_id} de "${evento.formulario_nome}" gravada para aluna ${alunaId}`,
  };
}
