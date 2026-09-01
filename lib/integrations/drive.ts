import { obterAccessToken } from "@/lib/integrations/google-auth";
import { requireEnv } from "@/lib/env";

/**
 * Client Google Drive — projeto Google Cloud da Adriana (via conta de serviço).
 *
 * Cobre: notificações push (watch no feed de changes), leitura de mudanças e
 * varredura de pastas (para o backfill). Este fluxo NÃO tenta inferir
 * assinatura de documento — isso é papel exclusivo da Autentique.
 */

const API_BASE = "https://www.googleapis.com/drive/v3";
export const MIME_PASTA = "application/vnd.google-apps.folder";

/**
 * Aceita o ID puro de uma pasta OU uma URL do Drive (colada do "Compartilhar",
 * ex.: https://drive.google.com/drive/folders/<id>?usp=sharing) e devolve só o
 * ID. O Drive rejeita a query se receber a URL inteira, então normalizamos aqui.
 */
export function idDePasta(valor: string): string {
  const v = valor.trim();
  const url = v.match(/\/folders\/([-\w]+)|[?&]id=([-\w]+)|\/d\/([-\w]+)/);
  if (url) return url[1] ?? url[2] ?? url[3] ?? v;
  return v;
}

async function driveFetch(caminho: string, init: RequestInit = {}): Promise<Response> {
  const token = await obterAccessToken();
  return fetch(`${API_BASE}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

interface ArquivoDrive {
  id: string;
  name?: string;
  mimeType?: string;
  parents?: string[];
  webViewLink?: string;
  trashed?: boolean;
}

/** Busca metadados de um arquivo/pasta do Drive. */
export async function metadadosArquivo(fileId: string): Promise<ArquivoDrive> {
  const resposta = await driveFetch(
    `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,parents,webViewLink,trashed`,
  );
  if (!resposta.ok) {
    throw new Error(
      `Drive: falha ao buscar arquivo ${fileId} (HTTP ${resposta.status}).`,
    );
  }
  return resposta.json() as Promise<ArquivoDrive>;
}

/** Retorna o startPageToken atual do feed de changes. */
export async function getStartPageToken(): Promise<string> {
  const resposta = await driveFetch("/changes/startPageToken");
  if (!resposta.ok) {
    throw new Error(`Drive: falha ao obter startPageToken (HTTP ${resposta.status}).`);
  }
  const json = (await resposta.json()) as { startPageToken: string };
  return json.startPageToken;
}

export interface CanalWatch {
  id: string;
  resourceId: string;
  expiration?: string;
}

/**
 * Cria um canal de push notifications sobre o feed de changes do Drive.
 * O `token` vira o header X-Goog-Channel-Token em cada notificação (nosso
 * segredo de autenticação da rota).
 */
export async function criarWatchChanges(params: {
  id: string;
  address: string;
  token: string;
  pageToken: string;
  /**
   * Expiração do canal em epoch ms (string). Opcional: se ausente, o Google usa
   * o default (curto, ~1h). Passando ~7 dias (o máximo concedido), o canal dura
   * bem mais, e o cron `/api/cron/drive-watch` renova antes de expirar.
   */
  expiration?: string;
}): Promise<CanalWatch> {
  const corpo: Record<string, unknown> = {
    id: params.id,
    type: "web_hook",
    address: params.address,
    token: params.token,
  };
  if (params.expiration !== undefined) corpo.expiration = params.expiration;

  const resposta = await driveFetch(
    `/changes/watch?pageToken=${encodeURIComponent(params.pageToken)}`,
    {
      method: "POST",
      body: JSON.stringify(corpo),
    },
  );
  if (!resposta.ok) {
    const detalhe = await resposta.text();
    throw new Error(`Drive: falha ao criar watch (HTTP ${resposta.status}): ${detalhe}`);
  }
  return resposta.json() as Promise<CanalWatch>;
}

/** Um arquivo novo pronto para virar registro em `materiais`. */
export interface MaterialDrive {
  fileId: string;
  nomeArquivo: string;
  tipo: string | null;
  linkDrive: string | null;
  /** Nome da subpasta (filha direta da raiz) onde o arquivo está. */
  subpastaNome: string;
}

interface MudancasResp {
  changes?: { fileId?: string; removed?: boolean; file?: ArquivoDrive }[];
  nextPageToken?: string;
  newStartPageToken?: string;
}

/**
 * Resolve, para o id de uma pasta pai, se ela é uma subpasta DIRETA da raiz da
 * Adriana; em caso positivo retorna o nome dela, senão null. Usa cache.
 */
async function nomeSubpastaRaiz(
  parentId: string,
  rootId: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  const emCache = cache.get(parentId);
  if (emCache !== undefined) return emCache;

  const meta = await metadadosArquivo(parentId);
  const ehSubpastaRaiz =
    meta.mimeType === MIME_PASTA && (meta.parents ?? []).includes(rootId);
  const nome = ehSubpastaRaiz ? (meta.name ?? "(sem nome)") : null;
  cache.set(parentId, nome);
  return nome;
}

/**
 * Lê as mudanças desde `pageToken` e devolve os arquivos NOVOS que estão numa
 * subpasta direta da raiz (candidatos a virar material). Ignora remoções,
 * lixeira e pastas. Retorna também o novo pageToken para persistir.
 */
export async function coletarNovosMateriais(
  pageToken: string,
): Promise<{ novoPageToken: string; itens: MaterialDrive[] }> {
  const rootId = idDePasta(requireEnv("DRIVE_ROOT_FOLDER_ID"));
  const itens: MaterialDrive[] = [];
  const cacheSubpasta = new Map<string, string | null>();

  let page = pageToken;
  let novoPageToken = pageToken;
  const campos =
    "newStartPageToken,nextPageToken,changes(fileId,removed,file(id,name,mimeType,parents,webViewLink,trashed))";

  // Percorre todas as páginas de mudanças desta notificação.
  for (;;) {
    const resposta = await driveFetch(
      `/changes?pageToken=${encodeURIComponent(page)}&pageSize=100&spaces=drive&fields=${encodeURIComponent(campos)}`,
    );
    if (!resposta.ok) {
      throw new Error(`Drive: falha ao listar mudanças (HTTP ${resposta.status}).`);
    }
    const json = (await resposta.json()) as MudancasResp;

    for (const mudanca of json.changes ?? []) {
      const arquivo = mudanca.file;
      if (mudanca.removed || !arquivo || arquivo.trashed) continue;
      if (arquivo.mimeType === MIME_PASTA) continue;
      const parent = arquivo.parents?.[0];
      if (!parent) continue;
      const subpasta = await nomeSubpastaRaiz(parent, rootId, cacheSubpasta);
      if (!subpasta) continue;

      itens.push({
        fileId: arquivo.id,
        nomeArquivo: arquivo.name ?? "(sem nome)",
        tipo: arquivo.mimeType ?? null,
        linkDrive: arquivo.webViewLink ?? null,
        subpastaNome: subpasta,
      });
    }

    if (json.nextPageToken) {
      page = json.nextPageToken;
      continue;
    }
    novoPageToken = json.newStartPageToken ?? page;
    break;
  }

  return { novoPageToken, itens };
}

interface ListaArquivosResp {
  files?: ArquivoDrive[];
  nextPageToken?: string;
}

async function listarComQuery(query: string): Promise<ArquivoDrive[]> {
  const arquivos: ArquivoDrive[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: query,
      fields: "nextPageToken,files(id,name,mimeType,webViewLink,parents,trashed)",
      pageSize: "1000",
      spaces: "drive",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const resposta = await driveFetch(`/files?${params.toString()}`);
    if (!resposta.ok) {
      throw new Error(`Drive: falha ao listar arquivos (HTTP ${resposta.status}).`);
    }
    const json = (await resposta.json()) as ListaArquivosResp;
    arquivos.push(...(json.files ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return arquivos;
}

/** Lista as subpastas diretas de uma pasta (para o backfill). */
export function listarSubpastas(rootId: string): Promise<ArquivoDrive[]> {
  return listarComQuery(
    `'${rootId}' in parents and mimeType = '${MIME_PASTA}' and trashed = false`,
  );
}

/** Lista os arquivos (não-pastas) diretos de uma pasta (para o backfill). */
export function listarArquivosDaPasta(folderId: string): Promise<ArquivoDrive[]> {
  return listarComQuery(
    `'${folderId}' in parents and mimeType != '${MIME_PASTA}' and trashed = false`,
  );
}
