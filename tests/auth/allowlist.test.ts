import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { emailPermitido, emailsPermitidos, normalizarEmail } from "@/lib/auth/allowlist";

const ADRIANA = "Adriana@Dominio.com";
const JOAO = "joao@fova.com";

describe("allowlist do dashboard", () => {
  beforeEach(() => {
    process.env.EMAIL_ADRIANA = ADRIANA;
    process.env.EMAIL_JOAO = JOAO;
  });

  afterEach(() => {
    delete process.env.EMAIL_ADRIANA;
    delete process.env.EMAIL_JOAO;
  });

  it("normaliza e-mail: trim + minúsculas", () => {
    expect(normalizarEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("lista os dois e-mails normalizados", () => {
    expect(emailsPermitidos()).toEqual(["adriana@dominio.com", "joao@fova.com"]);
  });

  it("aceita e-mail da allowlist ignorando caixa/espaços", () => {
    expect(emailPermitido("adriana@dominio.com")).toBe(true);
    expect(emailPermitido("  JOAO@FOVA.COM ")).toBe(true);
  });

  it("rejeita e-mail fora da allowlist", () => {
    expect(emailPermitido("intruso@dominio.com")).toBe(false);
  });

  it("rejeita null, undefined e vazio", () => {
    expect(emailPermitido(null)).toBe(false);
    expect(emailPermitido(undefined)).toBe(false);
    expect(emailPermitido("")).toBe(false);
  });

  it("lança se uma variável de ambiente estiver ausente", () => {
    delete process.env.EMAIL_JOAO;
    expect(() => emailPermitido("adriana@dominio.com")).toThrow(/EMAIL_JOAO/);
  });
});
