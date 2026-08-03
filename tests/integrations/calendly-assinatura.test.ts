import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { validarAssinaturaCalendly } from "@/lib/integrations/calendly";

const CHAVE = "signing-key-secreto";

function header(body: string, chave: string, t: number): string {
  const v1 = createHmac("sha256", chave).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

const agora = (): number => Math.floor(Date.now() / 1000);

describe("validarAssinaturaCalendly", () => {
  const body = JSON.stringify({ event: "invitee.created", payload: { uri: "x" } });

  it("aceita assinatura válida e recente", () => {
    expect(validarAssinaturaCalendly(header(body, CHAVE, agora()), body, CHAVE)).toBe(
      true,
    );
  });

  it("rejeita quando o header está ausente", () => {
    expect(validarAssinaturaCalendly(null, body, CHAVE)).toBe(false);
  });

  it("rejeita assinatura feita com outra chave", () => {
    const h = header(body, "chave-errada", agora());
    expect(validarAssinaturaCalendly(h, body, CHAVE)).toBe(false);
  });

  it("rejeita quando o corpo foi adulterado", () => {
    const h = header(body, CHAVE, agora());
    expect(validarAssinaturaCalendly(h, body + " ", CHAVE)).toBe(false);
  });

  it("rejeita timestamp fora da tolerância (anti-replay)", () => {
    const antigo = agora() - 10000;
    expect(validarAssinaturaCalendly(header(body, CHAVE, antigo), body, CHAVE)).toBe(
      false,
    );
  });

  it("rejeita header malformado", () => {
    expect(validarAssinaturaCalendly("lixo", body, CHAVE)).toBe(false);
  });
});
