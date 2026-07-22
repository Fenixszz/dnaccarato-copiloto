import { describe, expect, it } from "vitest";
import { SERVICOS_WEBHOOK, servicoWebhookSchema } from "@/lib/validation/webhooks";

describe("servicoWebhookSchema", () => {
  it.each(SERVICOS_WEBHOOK)("aceita o serviço %s", (servico) => {
    expect(servicoWebhookSchema.safeParse(servico).success).toBe(true);
  });

  it("rejeita serviço desconhecido", () => {
    expect(servicoWebhookSchema.safeParse("stripe").success).toBe(false);
  });

  it("rejeita valor que não é string", () => {
    expect(servicoWebhookSchema.safeParse(42).success).toBe(false);
  });
});
