import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { criarFakeSupabase, type FakeSupabase } from "../helpers/fakeSupabase";

/**
 * Teste de integração da rota /api/webhooks/asaas, simulando um payload real de
 * PAYMENT_CONFIRMED. Externos mockados: cliente Supabase (fake in-memory) e o
 * fetch do Asaas (busca do cliente). Exercita token, Zod, idempotência,
 * eventos_brutos, casar/criar aluna e gravar pagamento.
 */

const holder = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock("@/lib/db/client", () => ({
  getServiceClient: () => holder.client,
}));

import { POST } from "@/app/api/webhooks/asaas/route";

const TOKEN = "tok-secreto";

// Cliente que o Asaas devolve para o customer do pagamento.
const CLIENTE_ASAAS = {
  name: "Ana Prado",
  email: "ana@ex.com",
  mobilePhone: "+55 11 90000-0001",
};

// Payload real (resumido) de pagamento confirmado.
const PAGAMENTO_CONFIRMADO = {
  id: "evt_05b708f961d739ea7eba7e4db318f621",
  event: "PAYMENT_CONFIRMED",
  dateCreated: "2026-08-02 09:15:23",
  payment: {
    object: "payment",
    id: "pay_080225913252",
    customer: "cus_G7Dvo4iphUNk",
    value: 500,
    netValue: 480.5,
    billingType: "PIX",
    status: "CONFIRMED",
    dueDate: "2026-08-01",
    paymentDate: "2026-08-02",
    invoiceUrl: "https://www.asaas.com/i/080225913252",
    externalReference: null,
  },
};

function requisicao(body: unknown, token: string = TOKEN): Request {
  return new Request("http://localhost/api/webhooks/asaas", {
    method: "POST",
    headers: { "content-type": "application/json", "asaas-access-token": token },
    body: JSON.stringify(body),
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
  process.env.ASAAS_WEBHOOK_TOKEN = TOKEN;
  process.env.ASAAS_API_KEY = "chave-asaas";
  process.env.ASAAS_API_URL = "https://sandbox.asaas.com/api/v3";

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("/customers/")) {
        return Promise.resolve(
          new Response(JSON.stringify(CLIENTE_ASAAS), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("{}", { status: 404 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("POST /api/webhooks/asaas", () => {
  it("processa um pagamento confirmado: salva bruto, cria aluna e grava pagamento", async () => {
    const { store } = iniciar();

    const res = await POST(requisicao(PAGAMENTO_CONFIRMADO));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "processado" });

    expect(rows(store, "eventos_brutos")).toHaveLength(1);
    expect(rows(store, "eventos_brutos")[0]).toMatchObject({ origem: "asaas" });

    const alunas = rows(store, "alunas");
    expect(alunas).toHaveLength(1);
    expect(alunas[0]).toMatchObject({ nome: "Ana Prado", email: "ana@ex.com" });

    const pagamentos = rows(store, "pagamentos");
    expect(pagamentos).toHaveLength(1);
    expect(pagamentos[0]).toMatchObject({
      origem: "asaas",
      status: "pago",
      valor: 500,
      referencia_externa: "pay_080225913252",
      aluna_id: alunas[0]?.id,
    });

    expect(rows(store, "eventos_processados")).toHaveLength(1);
  });

  it("é idempotente: o mesmo evento duas vezes não duplica pagamento", async () => {
    const { store } = iniciar();

    await POST(requisicao(PAGAMENTO_CONFIRMADO));
    const res2 = await POST(requisicao(PAGAMENTO_CONFIRMADO));

    expect(res2.status).toBe(200);
    expect(await res2.json()).toMatchObject({
      status: "ignorado",
      motivo: "evento_duplicado",
    });
    expect(rows(store, "pagamentos")).toHaveLength(1);
    expect(rows(store, "eventos_brutos")).toHaveLength(1);
  });

  it("rejeita token inválido com 401 e não grava nada", async () => {
    const { store } = iniciar();

    const res = await POST(requisicao(PAGAMENTO_CONFIRMADO, "token-errado"));
    expect(res.status).toBe(401);
    expect(rows(store, "eventos_brutos")).toHaveLength(0);
    expect(rows(store, "eventos_processados")).toHaveLength(0);
  });

  it("rejeita payload inválido com 400", async () => {
    const { store } = iniciar();

    const res = await POST(
      requisicao({
        id: "evt_x",
        event: "PAYMENT_CONFIRMED",
        payment: { object: "payment" },
      }),
    );
    expect(res.status).toBe(400);
    expect(rows(store, "eventos_processados")).toHaveLength(0);
  });

  it("casa com uma aluna existente por email em vez de criar outra", async () => {
    const { store } = iniciar({
      alunas: [
        { id: "aluna-1", nome: "Ana Antiga", email: "ana@ex.com", telefone: null },
      ],
    });

    await POST(requisicao(PAGAMENTO_CONFIRMADO));

    expect(rows(store, "alunas")).toHaveLength(1);
    expect(rows(store, "pagamentos")[0]).toMatchObject({ aluna_id: "aluna-1" });
  });
});
