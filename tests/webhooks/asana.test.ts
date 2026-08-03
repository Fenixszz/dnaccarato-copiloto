import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { criarFakeSupabase, type FakeSupabase } from "../helpers/fakeSupabase";

/**
 * Teste de integração da rota /api/webhooks/asana: cobre o handshake (ecoa o
 * X-Hook-Secret) e o processamento de um evento de mudança de status
 * (completed → concluida). Supabase mockado; a busca da task na Asana é
 * mockada via global fetch.
 */

const holder = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({ getServiceClient: () => holder.client }));

import { POST } from "@/app/api/webhooks/asana/route";

const SECRET = "asana-hook-secret-teste";

const EVENTO_COMPLETED = {
  events: [
    {
      user: { gid: "u-1", resource_type: "user" },
      created_at: "2026-08-03T12:00:00.000Z",
      action: "changed",
      resource: { gid: "task-1", resource_type: "task" },
      parent: null,
      change: { field: "completed", action: "changed" },
    },
  ],
};

function assinar(body: string, chave = SECRET): string {
  return createHmac("sha256", chave).update(body).digest("hex");
}

function reqEvento(
  payload: unknown,
  opts: { chave?: string; assinar?: boolean } = {},
): Request {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.assinar !== false) {
    headers["x-hook-signature"] = assinar(body, opts.chave ?? SECRET);
  }
  return new Request("http://localhost/api/webhooks/asana", {
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

function mockFetchTaskCompleta(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("/tasks/")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                gid: "task-1",
                name: "Enviar material",
                completed: true,
                completed_at: "2026-08-03T12:00:00.000Z",
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(new Response("{}", { status: 404 }));
    }),
  );
}

beforeEach(() => {
  process.env.ASANA_ACCESS_TOKEN = "token-asana";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("POST /api/webhooks/asana", () => {
  it("handshake: guarda e ecoa o X-Hook-Secret, responde 200", async () => {
    const { store } = iniciar();

    const res = await POST(
      new Request("http://localhost/api/webhooks/asana", {
        method: "POST",
        headers: { "x-hook-secret": SECRET },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-hook-secret")).toBe(SECRET);
    // Secret persistido para validar eventos futuros.
    expect(rows(store, "estado_integracoes")[0]).toMatchObject({
      chave: "asana_hook_secret",
    });
    expect(rows(store, "estado_integracoes")[0]?.valor).toMatchObject({ secret: SECRET });
  });

  it("evento de completed: marca a task como concluida", async () => {
    mockFetchTaskCompleta();
    const { store } = iniciar({
      estado_integracoes: [{ chave: "asana_hook_secret", valor: { secret: SECRET } }],
      tasks_asana: [
        {
          id: "ta-1",
          aluna_id: "aluna-x",
          task_id: "task-1",
          titulo: "Enviar material",
          status: "em_andamento",
          concluido_em: null,
        },
      ],
    });

    const res = await POST(reqEvento(EVENTO_COMPLETED));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processados: 1, atualizados: 1 });

    const task = rows(store, "tasks_asana")[0];
    expect(task).toMatchObject({
      task_id: "task-1",
      status: "concluida",
      concluido_em: "2026-08-03T12:00:00.000Z",
    });
    expect(rows(store, "eventos_brutos")).toHaveLength(1);
  });

  it("rejeita assinatura inválida com 401", async () => {
    const { store } = iniciar({
      estado_integracoes: [{ chave: "asana_hook_secret", valor: { secret: SECRET } }],
      tasks_asana: [
        { id: "ta-1", aluna_id: "aluna-x", task_id: "task-1", status: "em_andamento" },
      ],
    });

    const res = await POST(reqEvento(EVENTO_COMPLETED, { chave: "chave-errada" }));
    expect(res.status).toBe(401);
    expect(rows(store, "eventos_brutos")).toHaveLength(0);
  });

  it("é idempotente: o mesmo evento no batch não é reprocessado", async () => {
    mockFetchTaskCompleta();
    const { store } = iniciar({
      estado_integracoes: [{ chave: "asana_hook_secret", valor: { secret: SECRET } }],
      tasks_asana: [
        { id: "ta-1", aluna_id: "aluna-x", task_id: "task-1", status: "em_andamento" },
      ],
    });

    await POST(reqEvento(EVENTO_COMPLETED));
    const res2 = await POST(reqEvento(EVENTO_COMPLETED));
    expect(await res2.json()).toMatchObject({ ignorados: 1, processados: 0 });
    expect(rows(store, "tasks_asana")[0]).toMatchObject({ status: "concluida" });
  });

  it("evento de task não rastreada é ignorado (sem aluna associada)", async () => {
    mockFetchTaskCompleta();
    const { store } = iniciar({
      estado_integracoes: [{ chave: "asana_hook_secret", valor: { secret: SECRET } }],
    });

    const res = await POST(reqEvento(EVENTO_COMPLETED));
    expect(await res.json()).toMatchObject({ processados: 1, atualizados: 0 });
    expect(rows(store, "tasks_asana")).toHaveLength(0);
  });
});
