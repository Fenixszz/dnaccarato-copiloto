import { describe, it, expect } from "vitest";
import { ehErroBillingAnthropic } from "@/lib/integrations/anthropic-billing";

describe("ehErroBillingAnthropic", () => {
  it("detecta error.type = billing_error (403)", () => {
    const corpo = JSON.stringify({
      type: "error",
      error: { type: "billing_error", message: "Billing issue" },
    });
    expect(ehErroBillingAnthropic(403, corpo)).toBe(true);
  });

  it("detecta 'credit balance too low' (400)", () => {
    const corpo = JSON.stringify({
      type: "error",
      error: {
        type: "invalid_request_error",
        message:
          "Your credit balance is too low to access the Anthropic API. Please purchase more credits.",
      },
    });
    expect(ehErroBillingAnthropic(400, corpo)).toBe(true);
  });

  it("detecta cartão recusado em corpo não-JSON (402)", () => {
    expect(ehErroBillingAnthropic(402, "payment method / card was declined")).toBe(true);
  });

  it("NÃO trata parâmetro inválido comum como billing (400)", () => {
    const corpo = JSON.stringify({
      type: "error",
      error: { type: "invalid_request_error", message: "max_tokens: must be >= 1" },
    });
    expect(ehErroBillingAnthropic(400, corpo)).toBe(false);
  });

  it("NÃO trata 500 que por acaso menciona billing como billing", () => {
    const corpo = JSON.stringify({
      error: { type: "api_error", message: "billing subsystem down" },
    });
    expect(ehErroBillingAnthropic(500, corpo)).toBe(false);
  });

  it("billing_error vale mesmo fora dos status típicos", () => {
    const corpo = JSON.stringify({ error: { type: "billing_error", message: "x" } });
    expect(ehErroBillingAnthropic(500, corpo)).toBe(true);
  });
});
