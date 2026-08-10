import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Testa o /api/health, em especial a checagem de "o briefing rodou hoje?".
 */

interface RQ {
  data: unknown;
  error: { message: string } | null;
}
const h = vi.hoisted(() => ({ briefings: { data: null, error: null } as RQ }));

vi.mock("@/lib/db/client", () => {
  const q = {
    select: () => q,
    gte: () => q,
    limit: () => q,
    then: (aoResolver: (v: RQ) => unknown) =>
      Promise.resolve(h.briefings).then(aoResolver),
  };
  return { getServiceClient: () => ({ from: () => q }) };
});

import { GET } from "@/app/api/health/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/health", () => {
  it("briefing rodou hoje → ok", async () => {
    h.briefings = { data: [{ enviado_em: "2026-08-10T11:00:00Z" }], error: null };
    process.env.BRIEFING_LIMITE_HORA = "10";
    const body = await (await GET()).json();
    expect(body.status).toBe("ok");
    expect(body.checks.briefing.status).toBe("ok");
  });

  it("não rodou e já passou do limite → degradado / nao_rodou", async () => {
    h.briefings = { data: [], error: null };
    process.env.BRIEFING_LIMITE_HORA = "0"; // limite 0 → sempre já passou
    const body = await (await GET()).json();
    expect(body.status).toBe("degradado");
    expect(body.checks.briefing.status).toBe("nao_rodou");
  });

  it("não rodou mas ainda antes do limite → ok / aguardando", async () => {
    h.briefings = { data: [], error: null };
    process.env.BRIEFING_LIMITE_HORA = "25"; // limite alto → ainda dentro do prazo
    const body = await (await GET()).json();
    expect(body.status).toBe("ok");
    expect(body.checks.briefing.status).toBe("aguardando");
  });

  it("erro no banco não derruba o health (status desconhecido, 200)", async () => {
    h.briefings = { data: null, error: { message: "db down" } };
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checks.briefing.status).toBe("desconhecido");
  });
});
