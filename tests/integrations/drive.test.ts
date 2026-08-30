import { describe, it, expect } from "vitest";
import { idDePasta } from "@/lib/integrations/drive";

/**
 * `idDePasta` normaliza DRIVE_ROOT_FOLDER_ID: aceita o ID puro ou uma URL do
 * Drive (o Drive rejeita a query se receber a URL inteira).
 */
describe("idDePasta", () => {
  const ID = "1BqYqqdJTfrwFjsHtpyjR0qd6Mf8HhteZ";

  it("mantém um ID puro", () => {
    expect(idDePasta(ID)).toBe(ID);
  });

  it("extrai o ID de uma URL de pasta (com ?usp=sharing)", () => {
    expect(idDePasta(`https://drive.google.com/drive/folders/${ID}?usp=sharing`)).toBe(
      ID,
    );
  });

  it("extrai o ID da forma ?id=", () => {
    expect(idDePasta(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
  });

  it("extrai o ID da forma /d/", () => {
    expect(idDePasta(`https://drive.google.com/file/d/${ID}/view`)).toBe(ID);
  });

  it("apara espaços em volta", () => {
    expect(idDePasta(`  ${ID}  `)).toBe(ID);
  });
});
