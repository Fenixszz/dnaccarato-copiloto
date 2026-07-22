import { describe, expect, it } from "vitest";
import { lerCorpoJson } from "@/lib/webhooks/validacao";

function requisicaoCom(corpo: string): Request {
  return new Request("http://localhost/api/webhooks/asaas", {
    method: "POST",
    body: corpo,
  });
}

describe("lerCorpoJson", () => {
  it("retorna o corpo quando o JSON é válido", async () => {
    const resultado = await lerCorpoJson(requisicaoCom('{"evento":"PAYMENT_RECEIVED"}'));
    expect(resultado).toEqual({
      sucesso: true,
      corpo: { evento: "PAYMENT_RECEIVED" },
    });
  });

  it("retorna erro quando o corpo não é JSON", async () => {
    const resultado = await lerCorpoJson(requisicaoCom("isso não é json"));
    expect(resultado.sucesso).toBe(false);
  });

  it("retorna erro quando o corpo é vazio", async () => {
    const resultado = await lerCorpoJson(requisicaoCom(""));
    expect(resultado.sucesso).toBe(false);
  });
});
