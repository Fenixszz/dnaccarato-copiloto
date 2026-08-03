import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";

/**
 * Client Asana (gestão de tarefas/projetos) — conta Asana da Adriana.
 * Credenciais via ambiente.
 */

const BASE_URL = "https://app.asana.com/api/1.0";

async function asanaFetch(caminho: string, init: RequestInit = {}): Promise<Response> {
  const token = requireEnv("ASANA_ACCESS_TOKEN");
  return fetch(`${BASE_URL}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

/** Retorna os dados do usuário Asana autenticado (conta da Adriana). */
export async function usuarioAtual(): Promise<unknown> {
  const resposta = await asanaFetch("/users/me");
  if (!resposta.ok) {
    throw new Error(`Asana: falha ao buscar usuário atual (HTTP ${resposta.status}).`);
  }
  return resposta.json();
}

export interface AsanaWebhookCriado {
  gid: string;
  resource: { gid: string };
  target: string;
}

/**
 * Cria um webhook na Asana. A requisição fica PENDENTE até a Asana bater no
 * `target` com o handshake (X-Hook-Secret) e o endpoint ecoar o mesmo header.
 * Por isso só funciona com um endpoint HTTPS público (não aceita localhost).
 */
export async function criarWebhook(
  resourceGid: string,
  target: string,
): Promise<AsanaWebhookCriado> {
  const resposta = await asanaFetch("/webhooks", {
    method: "POST",
    body: JSON.stringify({ data: { resource: resourceGid, target } }),
  });
  if (!resposta.ok) {
    const detalhe = await resposta.text();
    throw new Error(
      `Asana: falha ao criar webhook (HTTP ${resposta.status}): ${detalhe}`,
    );
  }
  const json = (await resposta.json()) as { data: AsanaWebhookCriado };
  return json.data;
}

export interface TaskAsana {
  gid: string;
  name?: string;
  completed?: boolean;
  completed_at?: string | null;
}

/** Busca o estado atual de uma task (completed/completed_at) na Asana. */
export async function buscarTask(taskGid: string): Promise<TaskAsana> {
  const resposta = await asanaFetch(
    `/tasks/${encodeURIComponent(taskGid)}?opt_fields=completed,completed_at,name`,
  );
  if (!resposta.ok) {
    throw new Error(`Asana: falha ao buscar task ${taskGid} (HTTP ${resposta.status}).`);
  }
  const json = (await resposta.json()) as { data: TaskAsana };
  return json.data;
}

/**
 * Valida a assinatura HMAC-SHA256 do header `X-Hook-Signature` sobre o corpo
 * cru, usando o X-Hook-Secret capturado no handshake. Tempo constante.
 */
export function validarAssinaturaAsana(
  header: string | null,
  rawBody: string,
  secret: string,
): boolean {
  if (!header) return false;
  const esperadoHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const recebido = Buffer.from(header, "hex");
  const esperado = Buffer.from(esperadoHex, "hex");
  if (recebido.length === 0 || recebido.length !== esperado.length) return false;
  return timingSafeEqual(recebido, esperado);
}
