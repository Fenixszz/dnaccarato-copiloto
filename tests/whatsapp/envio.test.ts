import { beforeEach, describe, expect, it, vi } from "vitest";
import { enviarComRetry, MAX_TENTATIVAS_ENVIO } from "@/lib/whatsapp/envio";
import { enviarMensagemWhatsApp } from "@/lib/whatsapp/evolution";

const { falhas, criarSupabaseFalso } = vi.hoisted(() => {
  const falhas: Array<Record<string, unknown>> = [];
  function criarSupabaseFalso() {
    return {
      from: (tabela: string) => {
        if (tabela !== "falhas_sistema") {
          throw new Error(`Tabela inesperada no teste: ${tabela}`);
        }
        return {
          insert: (registro: Record<string, unknown>) => {
            falhas.push({ ...registro });
            return Promise.resolve({ error: null });
          },
        };
      },
    };
  }
  return { falhas, criarSupabaseFalso };
});

vi.mock("@/lib/db/supabase", () => ({ obterSupabase: criarSupabaseFalso }));
vi.mock("@/lib/dormir", () => ({ dormir: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/whatsapp/evolution", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/whatsapp/evolution")>();
  return { ...original, enviarMensagemWhatsApp: vi.fn() };
});

const CONTEXTO = { area: "whatsapp", contexto: "resposta de teste" };

beforeEach(() => {
  falhas.length = 0;
  vi.mocked(enviarMensagemWhatsApp).mockReset();
});

describe("enviarComRetry", () => {
  it("sucesso na primeira tentativa: envia uma vez, sem falha registrada", async () => {
    vi.mocked(enviarMensagemWhatsApp).mockResolvedValue(undefined);

    await enviarComRetry("5511999990000", "oi", CONTEXTO);

    expect(vi.mocked(enviarMensagemWhatsApp)).toHaveBeenCalledTimes(1);
    expect(falhas).toEqual([]);
  });

  it("falha e depois sucesso: tenta de novo e não registra falha", async () => {
    vi.mocked(enviarMensagemWhatsApp)
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(undefined);

    await enviarComRetry("5511999990000", "oi", CONTEXTO);

    expect(vi.mocked(enviarMensagemWhatsApp)).toHaveBeenCalledTimes(2);
    expect(falhas).toEqual([]);
  });

  it("todas as tentativas falham: registra em falhas_sistema e relança", async () => {
    vi.mocked(enviarMensagemWhatsApp).mockRejectedValue(new Error("HTTP 500"));

    await expect(enviarComRetry("5511999990000", "oi", CONTEXTO)).rejects.toThrow(
      /após 3 tentativas/
    );

    expect(vi.mocked(enviarMensagemWhatsApp)).toHaveBeenCalledTimes(MAX_TENTATIVAS_ENVIO);
    expect(falhas).toEqual([
      expect.objectContaining({
        area: "whatsapp",
        severidade: "alta",
        erro: "HTTP 500",
      }),
    ]);
    expect(String(falhas[0].contexto)).toContain("resposta de teste");
  });
});
