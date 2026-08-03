import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { criarFakeSupabase, type FakeSupabase } from "../helpers/fakeSupabase";

/**
 * Teste de integração da rota /api/webhooks/calendly: cobre invitee.created,
 * invitee.canceled e a validação de assinatura HMAC. Supabase mockado por um
 * fake in-memory; a rota não chama a API do Calendly.
 */

const holder = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({ getServiceClient: () => holder.client }));

import { POST } from "@/app/api/webhooks/calendly/route";

const SIGNING_KEY = "signing-key-teste";
const INVITEE_URI = "https://api.calendly.com/scheduled_events/AAA/invitees/BBB";

const payloadBase = {
  uri: INVITEE_URI,
  email: "carla@ex.com",
  name: "Carla Souza",
  scheduled_event: {
    uri: "https://api.calendly.com/scheduled_events/AAA",
    name: "Mentoria",
    start_time: "2026-08-10T15:00:00.000000Z",
    end_time: "2026-08-10T15:30:00.000000Z",
    location: { type: "zoom", join_url: "https://zoom.us/j/123" },
  },
};

const CRIADO = {
  event: "invitee.created",
  payload: { ...payloadBase, status: "active" },
};
const CANCELADO = {
  event: "invitee.canceled",
  payload: { ...payloadBase, status: "canceled" },
};

function assinar(body: string, chave = SIGNING_KEY): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", chave).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

function requisicao(
  payload: unknown,
  opts: { assinar?: boolean; chave?: string } = {},
): Request {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.assinar !== false) {
    headers["calendly-webhook-signature"] = assinar(body, opts.chave ?? SIGNING_KEY);
  }
  return new Request("http://localhost/api/webhooks/calendly", {
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
  process.env.CALENDLY_WEBHOOK_SIGNING_KEY = SIGNING_KEY;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/webhooks/calendly", () => {
  it("invitee.created: cria aluna e grava reunião agendada", async () => {
    const { store } = iniciar();

    const res = await POST(requisicao(CRIADO));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "processado",
      evento: "invitee.created",
    });

    expect(rows(store, "eventos_brutos")).toHaveLength(1);
    const alunas = rows(store, "alunas");
    expect(alunas).toHaveLength(1);
    expect(alunas[0]).toMatchObject({ email: "carla@ex.com", nome: "Carla Souza" });

    const reunioes = rows(store, "reunioes");
    expect(reunioes).toHaveLength(1);
    expect(reunioes[0]).toMatchObject({
      origem: "calendly",
      status: "agendada",
      data_hora: "2026-08-10T15:00:00.000000Z",
      link: "https://zoom.us/j/123",
      referencia_externa: INVITEE_URI,
      aluna_id: alunas[0]?.id,
    });
  });

  it("invitee.canceled após created: atualiza a MESMA reunião para cancelada", async () => {
    const { store } = iniciar();

    await POST(requisicao(CRIADO));
    const res = await POST(requisicao(CANCELADO));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ evento: "invitee.canceled" });

    const reunioes = rows(store, "reunioes");
    expect(reunioes).toHaveLength(1); // não duplicou
    expect(reunioes[0]).toMatchObject({
      status: "cancelada",
      referencia_externa: INVITEE_URI,
    });
    expect(rows(store, "alunas")).toHaveLength(1); // não recriou a aluna
  });

  it("rejeita assinatura inválida com 401 e não grava nada", async () => {
    const { store } = iniciar();

    const res = await POST(requisicao(CRIADO, { chave: "chave-errada" }));
    expect(res.status).toBe(401);
    expect(rows(store, "eventos_brutos")).toHaveLength(0);
    expect(rows(store, "reunioes")).toHaveLength(0);
  });

  it("rejeita quando falta o header de assinatura com 401", async () => {
    const { store } = iniciar();

    const res = await POST(requisicao(CRIADO, { assinar: false }));
    expect(res.status).toBe(401);
    expect(rows(store, "eventos_processados")).toHaveLength(0);
  });

  it("é idempotente: o mesmo invitee.created duas vezes não duplica reunião", async () => {
    const { store } = iniciar();

    await POST(requisicao(CRIADO));
    const res2 = await POST(requisicao(CRIADO));
    expect(await res2.json()).toMatchObject({ status: "ignorado" });
    expect(rows(store, "reunioes")).toHaveLength(1);
  });
});
