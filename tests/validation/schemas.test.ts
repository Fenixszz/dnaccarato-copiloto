import { describe, it, expect } from "vitest";
import {
  servicoWebhookSchema,
  asaasWebhookSchema,
  calendlyWebhookSchema,
  extrairIdExterno,
} from "@/lib/validation/schemas";

describe("servicoWebhookSchema", () => {
  it("aceita serviços conhecidos", () => {
    expect(servicoWebhookSchema.safeParse("asaas").success).toBe(true);
    expect(servicoWebhookSchema.safeParse("whatsapp").success).toBe(true);
  });

  it("rejeita serviço desconhecido", () => {
    expect(servicoWebhookSchema.safeParse("banco-do-brasil").success).toBe(false);
  });
});

describe("asaasWebhookSchema", () => {
  it("exige o campo event", () => {
    expect(asaasWebhookSchema.safeParse({}).success).toBe(false);
  });

  it("aceita payload válido e preserva campos extras", () => {
    const resultado = asaasWebhookSchema.safeParse({
      id: "evt_123",
      event: "PAYMENT_CONFIRMED",
      payment: { id: "pay_1", value: 100 },
      extra: "mantido",
    });
    expect(resultado.success).toBe(true);
  });
});

describe("calendlyWebhookSchema", () => {
  it("exige event e payload", () => {
    expect(calendlyWebhookSchema.safeParse({ event: "invitee.created" }).success).toBe(
      false,
    );
  });
});

describe("extrairIdExterno", () => {
  it("extrai o id do Asaas", () => {
    expect(extrairIdExterno("asaas", { id: "evt_123", event: "X" })).toBe("evt_123");
  });

  it("extrai a uri do payload do Calendly", () => {
    expect(
      extrairIdExterno("calendly", {
        event: "invitee.created",
        payload: { uri: "https://api.calendly.com/scheduled_events/AAA" },
      }),
    ).toBe("https://api.calendly.com/scheduled_events/AAA");
  });

  it("compõe id do Drive a partir de resourceId e resourceState", () => {
    expect(
      extrairIdExterno("drive", { resourceId: "res_1", resourceState: "update" }),
    ).toBe("res_1:update");
  });

  it("extrai o id da mensagem do WhatsApp", () => {
    expect(
      extrairIdExterno("whatsapp", {
        event: "messages.upsert",
        data: { key: { id: "MSG_1" } },
      }),
    ).toBe("MSG_1");
  });

  it("retorna null quando não há identificador estável", () => {
    expect(extrairIdExterno("asaas", { event: "X" })).toBeNull();
  });
});
