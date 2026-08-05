import { describe, it, expect, vi } from "vitest";

/**
 * Teste da rota GET /api/alunas/[id]/dossie. O cliente Supabase é substituído
 * por um stub que resolve a query embutida (a lógica de agregação é testada em
 * tests/dossie.test.ts). Cobre id inválido (400), não encontrada (404) e 200.
 */

interface ResultadoQuery {
  data: unknown;
  error: { message: string } | null;
}

const holder = vi.hoisted(() => ({
  resultado: { data: null, error: null } as ResultadoQuery,
}));

vi.mock("@/lib/db/client", () => {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: () => Promise.resolve(holder.resultado),
  };
  return { getServiceClient: () => ({ from: () => query }) };
});

import { GET } from "@/app/api/alunas/[id]/dossie/route";

const UUID = "11111111-1111-1111-1111-111111111111";

function chamar(id: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/alunas/${id}/dossie`), { params: { id } });
}

describe("GET /api/alunas/[id]/dossie", () => {
  it("id inválido → 400", async () => {
    const res = await chamar("nao-eh-uuid");
    expect(res.status).toBe(400);
  });

  it("aluna inexistente → 404", async () => {
    holder.resultado = { data: null, error: null };
    const res = await chamar(UUID);
    expect(res.status).toBe(404);
  });

  it("erro no banco → 500 (tratado, não estoura)", async () => {
    holder.resultado = { data: null, error: { message: "boom" } };
    const res = await chamar(UUID);
    expect(res.status).toBe(500);
  });

  it("aluna existente → 200 com o dossiê agregado", async () => {
    holder.resultado = {
      data: {
        id: UUID,
        nome: "Ana Prado",
        email: "ana@ex.com",
        telefone: null,
        criado_em: "2026-01-01T00:00:00Z",
        metadata: {},
        pagamentos: [
          {
            id: "p1",
            origem: "asaas",
            status: "atrasado",
            valor: 500,
            vencimento: "2026-07-01",
            pago_em: null,
            referencia_externa: "r1",
          },
        ],
        documentos: [],
        materiais: [],
        formularios: [],
        reunioes: [],
        tasks_asana: [],
      },
      error: null,
    };
    const res = await chamar(UUID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aluna).toMatchObject({ id: UUID, nome: "Ana Prado" });
    expect(body.pagamentos.resumo).toMatchObject({ total: 1, em_atraso: true });
  });
});
