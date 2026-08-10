import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Integração da rota /api/webhooks/whatsapp: recebe a mensagem da Adriana,
 * chama a Anthropic (mockada) e responde na mesma conversa. Supabase é stub;
 * enviarTexto e responderComMcp são mockados.
 */

interface RQ {
  data: unknown;
  error: { message: string } | null;
}
const h = vi.hoisted(() => ({
  porTabela: {} as Record<string, RQ>,
  enviarTexto: vi.fn((_e: { numero: string; texto: string }) =>
    Promise.resolve({ ok: true, status: 200, corpo: {} }),
  ),
  responderComMcp: vi.fn((_t: string) => Promise.resolve("A Ana está em dia. ✅")),
}));

vi.mock("@/lib/db/client", () => {
  const make = (tabela: string) => {
    const res = (): RQ => h.porTabela[tabela] ?? { data: null, error: null };
    const q = {
      select: () => q,
      eq: () => q,
      limit: () => q,
      insert: () => q,
      maybeSingle: () => Promise.resolve(res()),
      then: (aoResolver: (v: RQ) => unknown) => Promise.resolve(res()).then(aoResolver),
    };
    return q;
  };
  return { getServiceClient: () => ({ from: (t: string) => make(t) }) };
});
vi.mock("@/lib/whatsapp/client", () => ({ enviarTexto: h.enviarTexto }));
vi.mock("@/lib/integrations/anthropic", () => ({ responderComMcp: h.responderComMcp }));

import { POST } from "@/app/api/webhooks/whatsapp/route";

const ADRIANA = "5511999990000";

function evento(
  over: Record<string, unknown> = {},
  dataOver: Record<string, unknown> = {},
): Request {
  const body = {
    event: "messages.upsert",
    instance: "dnaccarato",
    data: {
      key: { remoteJid: `${ADRIANA}@s.whatsapp.net`, fromMe: false, id: "MSG1" },
      message: { conversation: "status da Ana?" },
      pushName: "Adriana",
      ...dataOver,
    },
    ...over,
  };
  return new Request("http://localhost/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const jsonDe = async (res: Response) => res.json();

beforeEach(() => {
  h.porTabela = {};
  vi.clearAllMocks();
  h.enviarTexto.mockResolvedValue({ ok: true, status: 200, corpo: {} });
  h.responderComMcp.mockResolvedValue("A Ana está em dia. ✅");
  process.env.BRIEFING_WHATSAPP = "+55 11 99999-0000";
});

describe("POST /api/webhooks/whatsapp", () => {
  it("mensagem da Adriana: chama a Anthropic e responde na mesma conversa", async () => {
    const res = await POST(evento());
    expect((await jsonDe(res)).status).toBe("respondido");

    expect(h.responderComMcp).toHaveBeenCalledWith("status da Ana?");
    expect(h.enviarTexto).toHaveBeenCalledWith({
      numero: ADRIANA,
      texto: "A Ana está em dia. ✅",
    });
  });

  it("mensagem enviada por nós (fromMe) é ignorada", async () => {
    const res = await POST(
      evento(
        {},
        { key: { remoteJid: `${ADRIANA}@s.whatsapp.net`, fromMe: true, id: "M2" } },
      ),
    );
    expect((await jsonDe(res)).status).toBe("ignorado");
    expect(h.responderComMcp).not.toHaveBeenCalled();
  });

  it("mensagem de outro número é ignorada", async () => {
    const res = await POST(
      evento(
        {},
        { key: { remoteJid: "5511888887777@s.whatsapp.net", fromMe: false, id: "M3" } },
      ),
    );
    expect((await jsonDe(res)).status).toBe("ignorado");
    expect(h.responderComMcp).not.toHaveBeenCalled();
  });

  it("evento que não é messages.upsert é ignorado", async () => {
    const res = await POST(evento({ event: "connection.update" }));
    expect((await jsonDe(res)).status).toBe("ignorado");
    expect(h.responderComMcp).not.toHaveBeenCalled();
  });

  it("erro na Anthropic → envia fallback (não deixa a Adriana sem resposta)", async () => {
    h.responderComMcp.mockRejectedValue(new Error("anthropic caiu"));
    const res = await POST(evento());
    expect((await jsonDe(res)).status).toBe("respondido");
    const arg = h.enviarTexto.mock.calls[0]?.[0];
    expect(arg?.texto).toMatch(/problema/i);
  });

  it("mensagem repetida (mesmo id) é ignorada por idempotência", async () => {
    h.porTabela.eventos_processados = { data: [{ id: "x" }], error: null };
    const res = await POST(evento());
    expect((await jsonDe(res)).status).toBe("ignorado");
    expect(h.responderComMcp).not.toHaveBeenCalled();
  });
});
