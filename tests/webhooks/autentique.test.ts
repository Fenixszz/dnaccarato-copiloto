import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { criarFakeSupabase, type FakeSupabase } from "../helpers/fakeSupabase";

/**
 * Teste de integração da rota /api/webhooks/autentique, com payloads no formato
 * real de document.finished e signature.rejected. Supabase mockado por fake
 * in-memory; a rota não chama a API da Autentique.
 */

const holder = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({ getServiceClient: () => holder.client }));

import { POST } from "@/app/api/webhooks/autentique/route";

const SECRET = "autentique-secret-teste";

const DOCUMENT_FINISHED = {
  id: "doc-uuid-ana",
  object: "document",
  name: "Contrato de Matrícula.pdf",
  format: "pdf",
  url: "https://api.autentique.com.br/documentos/doc-uuid-ana",
  event: {
    id: "evt-finished-1",
    object: "event",
    organization: 4321,
    type: "document.finished",
    data: {
      object: {
        id: "doc-uuid-ana",
        name: "Contrato de Matrícula.pdf",
        author: { email: "ana@ex.com", name: "Ana Prado" },
        files: {
          original: "https://storage.autentique.com.br/original.pdf",
          signed: "https://storage.autentique.com.br/signed.pdf",
        },
        signatures: [{ email: "ana@ex.com", name: "Ana Prado", signed: {} }],
      },
      previous_attributes: {},
    },
    created_at: "2026-08-03T10:00:00.000Z",
  },
};

const SIGNATURE_REJECTED = {
  id: "doc-uuid-fernanda",
  object: "document",
  name: "Termo de Adesão.pdf",
  format: "pdf",
  url: "https://api.autentique.com.br/documentos/doc-uuid-fernanda",
  event: {
    id: "evt-rejected-1",
    object: "event",
    organization: 4321,
    type: "signature.rejected",
    data: {
      object: {
        public_id: "sig-fernanda",
        email: "fernanda@ex.com",
        name: "Fernanda Alves",
        events: [
          { type: "viewed", created_at: "2026-08-03T09:00:00.000Z" },
          {
            type: "rejected",
            reason: "Dados divergentes no documento",
            created_at: "2026-08-03T09:05:00.000Z",
          },
        ],
      },
      previous_attributes: {},
    },
    created_at: "2026-08-03T09:05:00.000Z",
  },
};

function assinar(body: string, chave = SECRET): string {
  return createHmac("sha256", chave).update(body).digest("hex");
}

function requisicao(
  payload: unknown,
  opts: { assinar?: boolean; chave?: string } = {},
): Request {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.assinar !== false) {
    headers["x-autentique-signature"] = assinar(body, opts.chave ?? SECRET);
  }
  return new Request("http://localhost/api/webhooks/autentique", {
    method: "POST",
    headers,
    body,
  });
}

function iniciar(sementes: Record<string, Record<string, unknown>[]> = {}): FakeSupabase {
  const fake = criarFakeSupabase(sementes);
  holder.client = fake.client;
  return fake;
}

const rows = (store: Record<string, Record<string, unknown>[]>, t: string) =>
  store[t] ?? [];

beforeEach(() => {
  process.env.AUTENTIQUE_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/webhooks/autentique", () => {
  it("document.finished: marca documento assinado com link e casa a aluna", async () => {
    const { store } = iniciar({
      alunas: [
        { id: "aluna-ana", nome: "Ana Prado", email: "ana@ex.com", telefone: null },
      ],
    });

    const res = await POST(requisicao(DOCUMENT_FINISHED));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "processado",
      tipo: "document.finished",
    });

    expect(rows(store, "eventos_brutos")).toHaveLength(1);
    expect(rows(store, "alunas")).toHaveLength(1); // não duplicou

    const documentos = rows(store, "documentos");
    expect(documentos).toHaveLength(1);
    expect(documentos[0]).toMatchObject({
      aluna_id: "aluna-ana",
      origem: "autentique",
      documento_id_externo: "doc-uuid-ana",
      status: "assinado",
      link_assinado: "https://storage.autentique.com.br/signed.pdf",
    });
    expect(documentos[0]?.assinado_em).toBeTruthy();
  });

  it("signature.rejected: marca rejeitado com motivo vindo de events[]", async () => {
    const { store } = iniciar();

    const res = await POST(requisicao(SIGNATURE_REJECTED));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tipo: "signature.rejected" });

    // Aluna criada a partir do signatário (não havia semente).
    const alunas = rows(store, "alunas");
    expect(alunas).toHaveLength(1);
    expect(alunas[0]).toMatchObject({ email: "fernanda@ex.com", nome: "Fernanda Alves" });

    const documentos = rows(store, "documentos");
    expect(documentos).toHaveLength(1);
    expect(documentos[0]).toMatchObject({
      documento_id_externo: "doc-uuid-fernanda",
      status: "rejeitado",
      motivo_rejeicao: "Dados divergentes no documento",
      aluna_id: alunas[0]?.id,
    });
  });

  it("rejeita assinatura inválida com 401 e não grava nada", async () => {
    const { store } = iniciar();

    const res = await POST(requisicao(DOCUMENT_FINISHED, { chave: "chave-errada" }));
    expect(res.status).toBe(401);
    expect(rows(store, "eventos_brutos")).toHaveLength(0);
    expect(rows(store, "documentos")).toHaveLength(0);
  });

  it("é idempotente por event.id: reentrega não duplica", async () => {
    const { store } = iniciar({
      alunas: [
        { id: "aluna-ana", nome: "Ana Prado", email: "ana@ex.com", telefone: null },
      ],
    });

    await POST(requisicao(DOCUMENT_FINISHED));
    const res2 = await POST(requisicao(DOCUMENT_FINISHED));
    expect(await res2.json()).toMatchObject({ status: "ignorado" });
    expect(rows(store, "documentos")).toHaveLength(1);
    expect(rows(store, "eventos_brutos")).toHaveLength(1);
  });

  it("outros tipos só são logados em eventos_brutos, sem ação em documentos", async () => {
    const { store } = iniciar();
    const viewed = {
      ...DOCUMENT_FINISHED,
      id: "doc-uuid-x",
      event: {
        ...DOCUMENT_FINISHED.event,
        id: "evt-viewed-1",
        type: "signature.viewed",
      },
    };

    const res = await POST(requisicao(viewed));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tipo: "signature.viewed" });
    expect(rows(store, "eventos_brutos")).toHaveLength(1);
    expect(rows(store, "documentos")).toHaveLength(0);
    expect(rows(store, "alunas")).toHaveLength(0);
  });
});
