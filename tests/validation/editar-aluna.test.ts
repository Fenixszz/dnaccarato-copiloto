import { describe, it, expect } from "vitest";
import { editarAlunaSchema } from "@/lib/validation/schemas";

describe("editarAlunaSchema", () => {
  it("aceita nome + e-mail + telefone válidos", () => {
    const r = editarAlunaSchema.safeParse({
      nome: "  Ana Clara ",
      email: "ana@ex.com",
      telefone: "+55 11 90000-0000",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.nome).toBe("Ana Clara");
      expect(r.data.email).toBe("ana@ex.com");
      expect(r.data.telefone).toBe("+55 11 90000-0000");
    }
  });

  it("converte e-mail/telefone vazios em null", () => {
    const r = editarAlunaSchema.safeParse({ nome: "Bia", email: "", telefone: "   " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBeNull();
      expect(r.data.telefone).toBeNull();
    }
  });

  it("aceita e-mail/telefone ausentes (null)", () => {
    const r = editarAlunaSchema.safeParse({ nome: "Bia", email: null, telefone: null });
    expect(r.success).toBe(true);
  });

  it("rejeita nome vazio", () => {
    expect(editarAlunaSchema.safeParse({ nome: "   " }).success).toBe(false);
  });

  it("rejeita e-mail inválido", () => {
    expect(
      editarAlunaSchema.safeParse({ nome: "Bia", email: "não-é-email" }).success,
    ).toBe(false);
  });
});
