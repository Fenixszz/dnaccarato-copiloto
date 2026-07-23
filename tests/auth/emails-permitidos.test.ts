import { afterEach, describe, expect, it, vi } from "vitest";
import { emailPermitido, listaDeEmailsPermitidos } from "@/lib/auth/emails-permitidos";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("listaDeEmailsPermitidos", () => {
  it("faz split, tira espaços e normaliza pra minúsculas", () => {
    vi.stubEnv("DASHBOARD_EMAILS_PERMITIDOS", " Adriana@Example.com , dono@example.com ");
    expect(listaDeEmailsPermitidos()).toEqual(["adriana@example.com", "dono@example.com"]);
  });

  it("env vazia ou ausente vira lista vazia", () => {
    vi.stubEnv("DASHBOARD_EMAILS_PERMITIDOS", "");
    expect(listaDeEmailsPermitidos()).toEqual([]);
  });

  it("ignora entradas vazias entre vírgulas", () => {
    vi.stubEnv("DASHBOARD_EMAILS_PERMITIDOS", "a@b.com,,, c@d.com,");
    expect(listaDeEmailsPermitidos()).toEqual(["a@b.com", "c@d.com"]);
  });
});

describe("emailPermitido", () => {
  it("aceita email da allowlist, ignorando caixa e espaços", () => {
    vi.stubEnv("DASHBOARD_EMAILS_PERMITIDOS", "adriana@example.com,dono@example.com");
    expect(emailPermitido("ADRIANA@example.com")).toBe(true);
    expect(emailPermitido("  dono@example.com  ")).toBe(true);
  });

  it("rejeita email fora da allowlist", () => {
    vi.stubEnv("DASHBOARD_EMAILS_PERMITIDOS", "adriana@example.com");
    expect(emailPermitido("intruso@example.com")).toBe(false);
  });

  it("rejeita null, undefined e string vazia", () => {
    vi.stubEnv("DASHBOARD_EMAILS_PERMITIDOS", "adriana@example.com");
    expect(emailPermitido(null)).toBe(false);
    expect(emailPermitido(undefined)).toBe(false);
    expect(emailPermitido("")).toBe(false);
  });

  it("com allowlist vazia, ninguém entra", () => {
    vi.stubEnv("DASHBOARD_EMAILS_PERMITIDOS", "");
    expect(emailPermitido("adriana@example.com")).toBe(false);
  });
});
