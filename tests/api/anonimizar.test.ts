import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { criarFakeSupabase } from "../helpers/fakeSupabase";

/**
 * Teste da rota POST /api/alunas/[id]/anonimizar. Cobre o gate de auth
 * (401 sem sessão, 403 se não for a Adriana), validação (id/confirmação),
 * o caminho feliz (200 + auditoria) e não encontrada (404).
 */

const ADRIANA = "adriana@ex.com";
const UUID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** Lê as linhas de uma tabela do fake (nunca undefined). */
const linhas = (tabela: string): Record<string, unknown>[] => holder.store[tabela] ?? [];

const holder = vi.hoisted(() => ({
  store: {} as Record<string, Record<string, unknown>[]>,
  client: null as unknown as SupabaseClient<Database>,
  user: null as { email: string } | null,
}));

vi.mock("@/lib/db/client", () => ({
  getServiceClient: () => holder.client,
}));

vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: holder.user } }) },
  }),
}));

import { POST } from "@/app/api/alunas/[id]/anonimizar/route";

function chamar(id: string, body: unknown): Promise<Response> {
  return POST(
    new Request(`http://localhost/api/alunas/${id}/anonimizar`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: { id } },
  );
}

beforeEach(() => {
  process.env.EMAIL_ADRIANA = ADRIANA;
  holder.user = { email: ADRIANA };
  const fake = criarFakeSupabase({
    alunas: [
      { id: UUID, nome: "Maria", email: "m@ex.com", metadata: {}, anonimizada_em: null },
    ],
    materiais: [{ id: "m1", aluna_id: UUID, nome_arquivo: "rg.pdf" }],
    documentos: [],
    log_auditoria: [],
  });
  holder.client = fake.client;
  holder.store = fake.store;
});

afterEach(() => {
  delete process.env.EMAIL_ADRIANA;
});

describe("POST /api/alunas/[id]/anonimizar", () => {
  it("sem sessão → 401", async () => {
    holder.user = null;
    const res = await chamar(UUID, { confirmar: true });
    expect(res.status).toBe(401);
  });

  it("logado mas não é a Adriana → 403", async () => {
    holder.user = { email: "joao@ex.com" };
    const res = await chamar(UUID, { confirmar: true });
    expect(res.status).toBe(403);
  });

  it("id inválido → 400", async () => {
    const res = await chamar("nao-eh-uuid", { confirmar: true });
    expect(res.status).toBe(400);
  });

  it("sem confirmação → 400", async () => {
    const res = await chamar(UUID, {});
    expect(res.status).toBe(400);
  });

  it("aluna inexistente → 404", async () => {
    const res = await chamar("00000000-0000-0000-0000-000000000000", { confirmar: true });
    expect(res.status).toBe(404);
  });

  it("Adriana confirma → 200, anonimiza e audita", async () => {
    const res = await chamar(UUID, { confirmar: true, motivo: "pedido da aluna" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.anonimizada).toBe(true);
    expect(body.removidos.materiais).toBe(1);

    // efeito colateral: aluna anonimizada + auditoria gravada
    const aluna = linhas("alunas")[0];
    expect(aluna?.email).toBeNull();
    expect(aluna?.anonimizada_em).toBeTruthy();
    expect(linhas("log_auditoria")).toHaveLength(1);
    expect(linhas("log_auditoria")[0]).toMatchObject({
      acao: "anonimizar_aluna",
      aluna_id: UUID,
      resultado: "sucesso",
    });
  });
});
