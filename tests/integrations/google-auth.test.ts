import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Testa o wiring da conta de serviço + impersonation, sem rede: valida decode
 * do base64, validação do JSON e construção do cliente JWT (email/subject/
 * escopos). A troca real por access token exige credenciais reais do Google.
 */

const CONTA = {
  client_email: "copiloto@projeto.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nZm9vYmFy\n-----END PRIVATE KEY-----\n",
};
const base64De = (obj: unknown): string =>
  Buffer.from(JSON.stringify(obj)).toString("base64");

// Recarrega o módulo do zero (limpa o cache de clientes por escopo).
async function carregar(): Promise<typeof import("@/lib/integrations/google-auth")> {
  vi.resetModules();
  return import("@/lib/integrations/google-auth");
}

beforeEach(() => {
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  delete process.env.EMAIL_ADRIANA;
});

describe("getGoogleClient", () => {
  it("constrói o JWT com email, subject (impersonation) e escopos", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = base64De(CONTA);
    process.env.EMAIL_ADRIANA = "adriana@dominio.com";
    const mod = await carregar();

    const jwt = mod.getGoogleClient();
    expect(jwt.email).toBe(CONTA.client_email);
    expect(jwt.subject).toBe("adriana@dominio.com");
    // Escopos read-only (o app só lê; menor privilégio).
    expect(jwt.scopes).toContain("https://www.googleapis.com/auth/drive.readonly");
    expect(jwt.scopes).toContain("https://www.googleapis.com/auth/calendar.readonly");
  });

  it("faz cache do cliente por conjunto de escopos", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = base64De(CONTA);
    process.env.EMAIL_ADRIANA = "adriana@dominio.com";
    const mod = await carregar();
    expect(mod.getGoogleClient()).toBe(mod.getGoogleClient());
  });

  it("lança erro claro quando GOOGLE_SERVICE_ACCOUNT_JSON está ausente", async () => {
    const mod = await carregar();
    expect(() => mod.getGoogleClient()).toThrow(/GOOGLE_SERVICE_ACCOUNT_JSON/);
  });

  it("lança erro quando o conteúdo não é um JSON válido", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON =
      Buffer.from("isso não é json").toString("base64");
    process.env.EMAIL_ADRIANA = "adriana@dominio.com";
    const mod = await carregar();
    expect(() => mod.getGoogleClient()).toThrow(/JSON válido/);
  });

  it("lança erro quando falta client_email/private_key", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = base64De({ client_email: "x@y.com" });
    process.env.EMAIL_ADRIANA = "adriana@dominio.com";
    const mod = await carregar();
    expect(() => mod.getGoogleClient()).toThrow(/client_email\/private_key/);
  });
});
