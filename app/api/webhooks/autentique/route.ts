import { NextResponse } from "next/server";
import { comTratamentoDeErro, logarErro, validarJson } from "@/lib/webhooks/validation";
import { jaProcessado, marcarProcessado } from "@/lib/webhooks/idempotency";
import { autentiqueEventoWebhookSchema } from "@/lib/validation/schemas";
import { validarAssinaturaAutentique } from "@/lib/integrations/autentique";
import { requireEnv } from "@/lib/env";
import { getServiceClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const ORIGEM = "autentique";
type SupabaseServer = ReturnType<typeof getServiceClient>;

/**
 * Webhook da Autentique (assinatura de documentos) — conta da Adriana.
 *
 * Fluxo (CLAUDE.md):
 *  1. Valida a assinatura HMAC-SHA256 do header X-Autentique-Signature sobre o
 *     corpo cru (timingSafeEqual, nunca ==) → 401.
 *  2. Valida o payload com Zod → 400.
 *  3. Idempotência por event.id (a Autentique não garante ordem e reenvia até
 *     3x em 60/120/300s se a rota falhar).
 *  4. Salva o payload cru em eventos_brutos.
 *  5. Trata os eventos relevantes (document.finished / signature.rejected);
 *     os demais só ficam logados em eventos_brutos.
 *
 * Processa de forma enxuta e retorna 200 assim que termina — como as reentregas
 * são idempotentes, completar antes de responder é seguro (se respondêssemos
 * 200 e falhássemos depois, perderíamos o retry).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rota = "POST /api/webhooks/autentique";

  return comTratamentoDeErro({ rota }, async () => {
    const rawBody = await request.text();

    // 1. Assinatura HMAC.
    const assinaturaOk = validarAssinaturaAutentique(
      request.headers.get("x-autentique-signature"),
      rawBody,
      requireEnv("AUTENTIQUE_WEBHOOK_SECRET"),
    );
    if (!assinaturaOk) {
      logarErro(new Error("Assinatura Autentique inválida"), { rota });
      return NextResponse.json({ erro: "Assinatura inválida." }, { status: 401 });
    }

    // 2. Zod.
    const validado = validarJson(rawBody, autentiqueEventoWebhookSchema, { rota });
    if (!validado.ok) return validado.resposta;
    const evento = validado.data;

    // 3. Idempotência pelo id do evento.
    if (await jaProcessado(ORIGEM, evento.event.id)) {
      return NextResponse.json({ status: "ignorado", motivo: "evento_duplicado" });
    }

    const db = getServiceClient();

    // 4. Payload cru.
    const { error: eBruto } = await db.from("eventos_brutos").insert({
      origem: ORIGEM,
      payload: evento as unknown as Json,
    });
    if (eBruto) throw new Error(`Falha ao salvar evento bruto: ${eBruto.message}`);

    // 5. Tratamento por tipo.
    const tipo = evento.event.type;
    const dataObj = evento.event.data.object;
    const documentoId = evento.id;
    const tipoDoc = evento.name ?? "documento";

    if (tipo === "document.finished") {
      // Signatário no author; documento assinado + link do arquivo assinado.
      const alunaId = await acharOuCriarAluna(
        db,
        extrairContato(asRecord(dataObj.author)),
      );
      await upsertDocumento(db, alunaId, {
        documentoId,
        tipoDoc,
        status: "assinado",
        assinadoEm: new Date().toISOString(),
        linkAssinado: strDeep(dataObj, ["files", "signed"]),
      });
    } else if (tipo === "signature.rejected") {
      // Signatário é o próprio objeto de signature; motivo vem de events[].
      const alunaId = await acharOuCriarAluna(db, extrairContato(dataObj));
      await upsertDocumento(db, alunaId, {
        documentoId,
        tipoDoc,
        status: "rejeitado",
        motivoRejeicao: extrairMotivoRejeicao(dataObj),
      });
    }
    // Demais tipos (document.created, signature.viewed/accepted, member.*, ...)
    // ficam só no eventos_brutos, sem ação por enquanto.

    await marcarProcessado(ORIGEM, evento.event.id);

    return NextResponse.json({ status: "processado", tipo });
  });
}

// ---------------------------------------------------------------------------
// Helpers de extração (defensivos: a forma de data.object varia por tipo).
// ---------------------------------------------------------------------------
function asRecord(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function str(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

/** Lê uma string em um caminho aninhado (ex.: ["files","signed"]). */
function strDeep(obj: Record<string, unknown>, caminho: string[]): string | null {
  let atual: unknown = obj;
  for (const chave of caminho) {
    const rec = asRecord(atual);
    if (!rec) return null;
    atual = rec[chave];
  }
  return str(atual);
}

interface Contato {
  email: string | null;
  cpf: string | null;
  nome: string | null;
}

function extrairContato(obj: Record<string, unknown> | null): Contato {
  if (!obj) return { email: null, cpf: null, nome: null };
  const user = asRecord(obj.user);
  return {
    email: str(obj.email) ?? (user ? str(user.email) : null),
    cpf: str(obj.cpf),
    nome: str(obj.name) ?? (user ? str(user.name) : null),
  };
}

/** Procura em data.object.events a entrada type="rejected" e extrai o motivo. */
function extrairMotivoRejeicao(dataObj: Record<string, unknown>): string {
  const eventos = Array.isArray(dataObj.events) ? dataObj.events : [];
  for (const item of eventos) {
    const rec = asRecord(item);
    if (rec && str(rec.type) === "rejected") {
      return (
        str(rec.reason) ??
        str(rec.comment) ??
        str(asRecord(rec.data)?.reason) ??
        "Assinatura rejeitada"
      );
    }
  }
  return "Assinatura rejeitada";
}

/** Casa a aluna pelo email do signatário; cria se não achar (CPF vai no metadata). */
async function acharOuCriarAluna(db: SupabaseServer, contato: Contato): Promise<string> {
  const email = contato.email;
  const nome = contato.nome ?? email ?? "Signatário (Autentique)";

  if (email) {
    const { data, error } = await db
      .from("alunas")
      .select("id")
      .eq("email", email)
      .limit(1);
    if (error) throw new Error(`Falha ao buscar aluna por email: ${error.message}`);
    const achado = data?.[0];
    if (achado) return achado.id;
  }

  const metadata: Record<string, string | boolean> = {
    origem_cadastro: "autentique",
    mentorada: false,
  };
  if (contato.cpf) metadata.cpf = contato.cpf;

  const { data, error } = await db
    .from("alunas")
    .insert({ nome, email, telefone: null, metadata })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Falha ao criar aluna: ${error?.message ?? "sem retorno"}`);
  }
  return data.id;
}

interface CamposDocumento {
  documentoId: string;
  tipoDoc: string;
  status: "assinado" | "rejeitado";
  assinadoEm?: string | null;
  linkAssinado?: string | null;
  motivoRejeicao?: string | null;
}

/** Insere/atualiza o documento, deduplicando por (origem, documento_id_externo). */
async function upsertDocumento(
  db: SupabaseServer,
  alunaId: string,
  campos: CamposDocumento,
): Promise<void> {
  const patch = {
    status: campos.status,
    assinado_em: campos.assinadoEm ?? null,
    link_assinado: campos.linkAssinado ?? null,
    motivo_rejeicao: campos.motivoRejeicao ?? null,
  };

  const { data, error } = await db
    .from("documentos")
    .select("id")
    .eq("origem", ORIGEM)
    .eq("documento_id_externo", campos.documentoId)
    .limit(1);
  if (error) throw new Error(`Falha ao buscar documento existente: ${error.message}`);

  const existente = data?.[0];
  if (existente) {
    const { error: eUp } = await db
      .from("documentos")
      .update(patch)
      .eq("id", existente.id);
    if (eUp) throw new Error(`Falha ao atualizar documento: ${eUp.message}`);
  } else {
    const { error: eIns } = await db.from("documentos").insert({
      aluna_id: alunaId,
      tipo: campos.tipoDoc,
      origem: ORIGEM,
      documento_id_externo: campos.documentoId,
      ...patch,
    });
    if (eIns) throw new Error(`Falha ao inserir documento: ${eIns.message}`);
  }
}
