import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { criarFakeSupabase, type FakeSupabase } from "../helpers/fakeSupabase";

/**
 * Teste de integração da rota /api/webhooks/forms: valida o header secreto,
 * Zod, idempotência, eventos_brutos, casar/criar aluna e gravar formulários.
 * Supabase mockado por um fake in-memory.
 */

const holder = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({ getServiceClient: () => holder.client }));

import { POST } from "@/app/api/webhooks/forms/route";

const SECRET = "forms-secret-teste";

const RESPOSTA = {
  formId: "form-abc",
  formTitle: "Onboarding",
  responseId: "resp-001",
  email: "daniela@ex.com",
  nome: "Daniela Rocha",
  respostas: { Objetivo: "Reforço de matemática", Turno: "Noite" },
  respondidoEm: "2026-08-03T10:00:00.000Z",
};

function requisicao(payload: unknown, secret: string = SECRET): Request {
  return new Request("http://localhost/api/webhooks/forms", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forms-secret": secret },
    body: JSON.stringify(payload),
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
  process.env.FORMS_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/webhooks/forms", () => {
  it("processa uma resposta nova: cria aluna e grava o formulário", async () => {
    const { store } = iniciar();

    const res = await POST(requisicao(RESPOSTA));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "processado" });

    expect(rows(store, "eventos_brutos")).toHaveLength(1);

    const alunas = rows(store, "alunas");
    expect(alunas).toHaveLength(1);
    expect(alunas[0]).toMatchObject({ email: "daniela@ex.com", nome: "Daniela Rocha" });

    const formularios = rows(store, "formularios");
    expect(formularios).toHaveLength(1);
    expect(formularios[0]).toMatchObject({
      aluna_id: alunas[0]?.id,
      formulario_nome: "Onboarding",
      respondido_em: "2026-08-03T10:00:00.000Z",
    });
    expect(formularios[0]?.respostas).toMatchObject({
      Objetivo: "Reforço de matemática",
    });
    expect(rows(store, "eventos_processados")).toHaveLength(1);
  });

  it("rejeita segredo inválido com 401 e não grava nada", async () => {
    const { store } = iniciar();

    const res = await POST(requisicao(RESPOSTA, "errado"));
    expect(res.status).toBe(401);
    expect(rows(store, "eventos_brutos")).toHaveLength(0);
    expect(rows(store, "formularios")).toHaveLength(0);
  });

  it("é idempotente: a mesma resposta duas vezes não duplica o formulário", async () => {
    const { store } = iniciar();

    await POST(requisicao(RESPOSTA));
    const res2 = await POST(requisicao(RESPOSTA));

    expect(await res2.json()).toMatchObject({ status: "ignorado" });
    expect(rows(store, "formularios")).toHaveLength(1);
  });

  it("casa com uma aluna existente por email em vez de criar outra", async () => {
    const { store } = iniciar({
      alunas: [
        {
          id: "aluna-1",
          nome: "Daniela Antiga",
          email: "daniela@ex.com",
          telefone: null,
        },
      ],
    });

    await POST(requisicao(RESPOSTA));

    expect(rows(store, "alunas")).toHaveLength(1);
    expect(rows(store, "formularios")[0]).toMatchObject({ aluna_id: "aluna-1" });
  });
});
