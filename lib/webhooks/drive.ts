import { obterSupabase } from "@/lib/db/supabase";
import type { Json } from "@/lib/db/types";
import { listarArquivosDaPasta } from "@/lib/integrations/drive";
import { nomesCorrespondem, normalizarNome } from "@/lib/matching/nomes";
import type { ArquivoDrive, NotificacaoDrive } from "@/lib/validation/drive";
import { jaProcessado, marcarProcessado } from "@/lib/webhooks/idempotency";

const ORIGEM = "drive";

export type DocumentoDeAluna = {
  tipo: string;
  nomeAluna: string;
  assinado: boolean;
};

// Critério de "documento de aluna": arquivo dentro da pasta configurada
// (DRIVE_PASTA_DOCUMENTOS_ID) com nome no padrão
//   "Tipo - Nome da Aluna.ext"            → documento pendente
//   "Tipo - Nome da Aluna - ASSINADO.ext" → documento assinado
// Qualquer arquivo fora do padrão é ignorado.
export function interpretarNomeDeArquivo(nomeArquivo: string): DocumentoDeAluna | null {
  const semExtensao = nomeArquivo.replace(/\.[^.]+$/, "");
  const partes = semExtensao
    .split(" - ")
    .map((parte) => parte.trim())
    .filter((parte) => parte !== "");
  if (partes.length < 2) {
    return null;
  }
  const assinado = normalizarNome(partes[partes.length - 1]).includes("assinado");
  const relevantes = assinado ? partes.slice(0, -1) : partes;
  if (relevantes.length < 2) {
    return null;
  }
  const [tipo, ...nome] = relevantes;
  return { tipo, nomeAluna: nome.join(" - "), assinado };
}

async function salvarEventoBruto(payloadCru: unknown): Promise<void> {
  const { error } = await obterSupabase()
    .from("eventos_brutos")
    .insert({
      origem: ORIGEM,
      payload: payloadCru as Json,
    });
  if (error) {
    throw new Error(`Falha ao salvar evento bruto: ${error.message}`);
  }
}

type AlunaParaMatching = { id: string; nome: string };

async function listarAlunas(): Promise<AlunaParaMatching[]> {
  const { data, error } = await obterSupabase().from("alunas").select("id, nome");
  if (error) {
    throw new Error(`Falha ao listar alunas para matching: ${error.message}`);
  }
  return data ?? [];
}

async function criarAluna(nome: string): Promise<string> {
  const { data, error } = await obterSupabase()
    .from("alunas")
    .insert({
      nome,
      metadata: { origem_cadastro: "webhook_drive" },
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`Falha ao criar aluna: ${error.message}`);
  }
  return data.id;
}

async function gravarDocumento(
  arquivo: ArquivoDrive,
  documento: DocumentoDeAluna,
  alunaId: string
): Promise<void> {
  const { error } = await obterSupabase()
    .from("documentos")
    .upsert(
      {
        aluna_id: alunaId,
        tipo: documento.tipo,
        status: documento.assinado ? "assinado" : "pendente",
        assinado_em: documento.assinado ? (arquivo.modifiedTime ?? new Date().toISOString()) : null,
        link_drive: arquivo.webViewLink ?? null,
        referencia_externa: arquivo.id,
      },
      { onConflict: "referencia_externa" }
    );
  if (error) {
    throw new Error(`Falha ao gravar documento ${arquivo.id}: ${error.message}`);
  }
}

export type ResultadoProcessamento = {
  status: "duplicado" | "ignorado" | "processado";
  resumo: string;
};

// Fluxo de uma notificação push do Drive: como a notificação não diz o que
// mudou, sincroniza a pasta de documentos inteira. Erro estoura pra rota
// responder 500 sem marcar processado (o Drive reenvia a notificação).
export async function processarNotificacaoDrive(
  notificacao: NotificacaoDrive,
  payloadCru: unknown
): Promise<ResultadoProcessamento> {
  // "sync" é o handshake disparado na criação do canal — só confirma.
  if (notificacao.estado === "sync") {
    return { status: "ignorado", resumo: "handshake de criação do canal confirmado" };
  }

  const eventoId = `${notificacao.canal_id}:${notificacao.numero_mensagem}`;
  if (await jaProcessado(ORIGEM, eventoId)) {
    return { status: "duplicado", resumo: "notificação já processada, entrega repetida ignorada" };
  }

  await salvarEventoBruto(payloadCru);

  const pastaId = process.env.DRIVE_PASTA_DOCUMENTOS_ID;
  if (!pastaId) {
    throw new Error("DRIVE_PASTA_DOCUMENTOS_ID não configurada (veja .env.example)");
  }

  const arquivos = await listarArquivosDaPasta(pastaId);
  const alunas = await listarAlunas();
  let sincronizados = 0;

  for (const arquivo of arquivos) {
    const documento = interpretarNomeDeArquivo(arquivo.name);
    if (!documento) {
      continue;
    }
    let aluna = alunas.find((candidata) => nomesCorrespondem(candidata.nome, documento.nomeAluna));
    if (!aluna) {
      const alunaId = await criarAluna(documento.nomeAluna);
      aluna = { id: alunaId, nome: documento.nomeAluna };
      // Entra na lista local pra outro documento da mesma pessoa, na mesma
      // sincronização, não criar duplicata.
      alunas.push(aluna);
    }
    await gravarDocumento(arquivo, documento, aluna.id);
    sincronizados += 1;
  }

  const resumo = `${sincronizados} documento(s) de aluna sincronizado(s) da pasta`;
  await marcarProcessado(ORIGEM, eventoId, resumo);
  return { status: "processado", resumo };
}
