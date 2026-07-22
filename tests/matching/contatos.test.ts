import { describe, expect, it } from "vitest";
import {
  emailsCorrespondem,
  encontrarPorContato,
  normalizarTelefone,
  telefonesCorrespondem,
} from "@/lib/matching/contatos";

describe("emailsCorrespondem", () => {
  it("ignora caixa e espaços nas pontas", () => {
    expect(emailsCorrespondem(" Maria@Gmail.com ", "maria@gmail.com")).toBe(true);
  });

  it("rejeita emails diferentes e vazios", () => {
    expect(emailsCorrespondem("maria@gmail.com", "maria@hotmail.com")).toBe(false);
    expect(emailsCorrespondem("", "")).toBe(false);
  });
});

describe("normalizarTelefone", () => {
  it("mantém só os dígitos", () => {
    expect(normalizarTelefone("+55 (11) 91234-5678")).toBe("5511912345678");
  });
});

describe("telefonesCorrespondem", () => {
  it("aceita o mesmo número em formatos diferentes", () => {
    expect(telefonesCorrespondem("+55 11 91234-5678", "11912345678")).toBe(true);
    expect(telefonesCorrespondem("912345678", "5511912345678")).toBe(true);
  });

  it("rejeita números diferentes", () => {
    expect(telefonesCorrespondem("11912345678", "11987654321")).toBe(false);
  });

  it("rejeita vazio", () => {
    expect(telefonesCorrespondem("", "11912345678")).toBe(false);
  });

  it("número curto só casa por igualdade exata", () => {
    expect(telefonesCorrespondem("4004", "4004")).toBe(true);
    expect(telefonesCorrespondem("4004", "11912344004")).toBe(false);
  });
});

describe("encontrarPorContato", () => {
  const alunas = [
    { id: "a1", email: "ana@example.com", telefone: "+55 11 91111-0001" },
    { id: "a2", email: null, telefone: "11922220002" },
    { id: "a3", email: "carla@example.com", telefone: null },
  ];

  it("acha por email normalizado", () => {
    expect(encontrarPorContato(alunas, "ANA@example.com", [])?.id).toBe("a1");
  });

  it("acha por telefone em outro formato", () => {
    expect(encontrarPorContato(alunas, null, ["+55 (11) 92222-0002"])?.id).toBe("a2");
  });

  it("retorna null quando nada bate", () => {
    expect(encontrarPorContato(alunas, "zoe@example.com", ["11933330003"])).toBeNull();
  });

  it("ignora telefones vazios ou nulos na busca", () => {
    expect(encontrarPorContato(alunas, null, [null, undefined, ""])).toBeNull();
  });
});
