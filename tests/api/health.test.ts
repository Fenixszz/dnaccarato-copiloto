import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { avaliarSaudeBriefing, HORA_LIMITE_BRIEFING_UTC } from "@/lib/health";

describe("avaliarSaudeBriefing", () => {
  const antesDoLimite = new Date(`2026-07-22T0${HORA_LIMITE_BRIEFING_UTC - 3}:00:00.000Z`);
  const depoisDoLimite = new Date(`2026-07-22T${HORA_LIMITE_BRIEFING_UTC + 1}:00:00.000Z`);

  it("com briefing do dia: ok, independente da hora", () => {
    expect(avaliarSaudeBriefing(true, antesDoLimite)).toBe("ok");
    expect(avaliarSaudeBriefing(true, depoisDoLimite)).toBe("ok");
  });

  it("sem briefing antes do horário limite: aguardando (esperado)", () => {
    expect(avaliarSaudeBriefing(false, antesDoLimite)).toBe("aguardando");
  });

  it("sem briefing depois do horário limite: atrasado", () => {
    expect(avaliarSaudeBriefing(false, depoisDoLimite)).toBe("atrasado");
  });
});

const { estado, criarSupabaseFalso } = vi.hoisted(() => {
  const estado: { briefingExiste: boolean; erroConsulta: boolean } = {
    briefingExiste: false,
    erroConsulta: false,
  };
  function criarSupabaseFalso() {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve(
                estado.erroConsulta
                  ? { data: null, error: { message: "connection refused" } }
                  : { data: estado.briefingExiste ? { id: "b1" } : null, error: null }
              ),
          }),
        }),
      }),
    };
  }
  return { estado, criarSupabaseFalso };
});

vi.mock("@/lib/db/supabase", () => ({ obterSupabase: criarSupabaseFalso }));

beforeEach(() => {
  estado.briefingExiste = false;
  estado.erroConsulta = false;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/health", () => {
  it("briefing enviado hoje: status ok, HTTP 200", async () => {
    estado.briefingExiste = true;
    const resposta = await GET();

    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as { status: string; briefing: { status: string } };
    expect(corpo.status).toBe("ok");
    expect(corpo.briefing.status).toBe("ok");
  });

  it("sem briefing e passou do limite: degradado, HTTP 503", async () => {
    vi.setSystemTime(new Date(`2026-07-22T${HORA_LIMITE_BRIEFING_UTC + 2}:00:00.000Z`));

    const resposta = await GET();

    expect(resposta.status).toBe(503);
    const corpo = (await resposta.json()) as { status: string; briefing: { status: string } };
    expect(corpo.status).toBe("degradado");
    expect(corpo.briefing.status).toBe("atrasado");
  });

  it("sem briefing mas antes do limite: ok (aguardando), HTTP 200", async () => {
    vi.setSystemTime(new Date(`2026-07-22T0${HORA_LIMITE_BRIEFING_UTC - 5}:00:00.000Z`));

    const resposta = await GET();

    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as { briefing: { status: string } };
    expect(corpo.briefing.status).toBe("aguardando");
  });

  it("erro no banco: degradado com status desconhecido, HTTP 503", async () => {
    estado.erroConsulta = true;

    const resposta = await GET();

    expect(resposta.status).toBe(503);
    const corpo = (await resposta.json()) as { status: string; briefing: { status: string } };
    expect(corpo.status).toBe("degradado");
    expect(corpo.briefing.status).toBe("desconhecido");
  });
});
