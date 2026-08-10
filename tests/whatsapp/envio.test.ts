import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Testa enviarComRetry: retry com backoff (até 3 tentativas) e, se todas
 * falharem, registro em falhas_sistema com severidade alta.
 */

const h = vi.hoisted(() => ({
  enviarTexto: vi.fn(),
  registrarFalhaSistema: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/whatsapp/client", () => ({ enviarTexto: h.enviarTexto }));
vi.mock("@/lib/db/queries", () => ({ registrarFalhaSistema: h.registrarFalhaSistema }));

import { enviarComRetry } from "@/lib/whatsapp/envio";

const semEsperar = { dormir: () => Promise.resolve() };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enviarComRetry", () => {
  it("sucesso na primeira tentativa: não repete nem registra falha", async () => {
    h.enviarTexto.mockResolvedValue({ ok: true, status: 200, corpo: {} });
    const r = await enviarComRetry({ numero: "5511", texto: "oi" }, semEsperar);
    expect(r.ok).toBe(true);
    expect(r.tentativas).toBe(1);
    expect(h.enviarTexto).toHaveBeenCalledTimes(1);
    expect(h.registrarFalhaSistema).not.toHaveBeenCalled();
  });

  it("falha e depois sucesso: repete e dá certo", async () => {
    h.enviarTexto
      .mockResolvedValueOnce({ ok: false, status: 500, corpo: {} })
      .mockResolvedValueOnce({ ok: true, status: 200, corpo: {} });
    const r = await enviarComRetry({ numero: "5511", texto: "oi" }, semEsperar);
    expect(r.ok).toBe(true);
    expect(r.tentativas).toBe(2);
    expect(h.enviarTexto).toHaveBeenCalledTimes(2);
    expect(h.registrarFalhaSistema).not.toHaveBeenCalled();
  });

  it("todas as 3 tentativas falham → registra falha alta e retorna ok:false", async () => {
    h.enviarTexto.mockResolvedValue({ ok: false, status: 500, corpo: {} });
    const r = await enviarComRetry({ numero: "5511", texto: "oi" }, semEsperar);
    expect(r.ok).toBe(false);
    expect(r.tentativas).toBe(3);
    expect(h.enviarTexto).toHaveBeenCalledTimes(3);
    expect(h.registrarFalhaSistema).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "whatsapp_envio", severidade: "alta" }),
    );
  });

  it("exceção no envio também é tratada como falha e conta como tentativa", async () => {
    h.enviarTexto.mockRejectedValue(new Error("rede caiu"));
    const r = await enviarComRetry(
      { numero: "5511", texto: "oi" },
      { ...semEsperar, tentativas: 2 },
    );
    expect(r.ok).toBe(false);
    expect(h.enviarTexto).toHaveBeenCalledTimes(2);
    expect(h.registrarFalhaSistema).toHaveBeenCalledTimes(1);
  });
});
