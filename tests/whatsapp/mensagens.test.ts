import { describe, expect, it } from "vitest";
import { formatarNumeroWhatsApp } from "@/lib/whatsapp/evolution";
import { montarLembreteDePagamento } from "@/lib/whatsapp/mensagens";

describe("formatarNumeroWhatsApp", () => {
  it("mantém número já com DDI", () => {
    expect(formatarNumeroWhatsApp("+55 (11) 91234-5678")).toBe("5511912345678");
  });

  it("adiciona o DDI 55 quando falta", () => {
    expect(formatarNumeroWhatsApp("(11) 91234-5678")).toBe("5511912345678");
    expect(formatarNumeroWhatsApp("11 3123-4567")).toBe("551131234567");
  });

  it("rejeita número curto demais", () => {
    expect(formatarNumeroWhatsApp("4004")).toBeNull();
    expect(formatarNumeroWhatsApp("")).toBeNull();
  });
});

describe("montarLembreteDePagamento", () => {
  it("usa o primeiro nome e formata valor e vencimento", () => {
    const mensagem = montarLembreteDePagamento("Beatriz Lima", [
      { valor: 1200, vencimento: "2026-07-12" },
    ]);
    expect(mensagem).toContain("Oi, Beatriz!");
    expect(mensagem).toContain("R$ 1200,00 (venceu em 12/07/2026)");
  });

  it("lista vários pagamentos separados por 'e'", () => {
    const mensagem = montarLembreteDePagamento("Beatriz Lima", [
      { valor: 1200, vencimento: "2026-06-12" },
      { valor: 300, vencimento: null },
    ]);
    expect(mensagem).toContain("R$ 1200,00 (venceu em 12/06/2026) e R$ 300,00");
  });
});
