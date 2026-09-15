import { describe, it, expect } from "vitest";
import { mentoradaVisivel } from "@/lib/mentoradas/filtro";

describe("mentoradaVisivel", () => {
  it("oculta apenas quando mentorada é explicitamente false", () => {
    expect(mentoradaVisivel({ mentorada: false })).toBe(false);
    expect(mentoradaVisivel({ mentorada: "false" })).toBe(false);
  });

  it("mostra quando mentorada é true", () => {
    expect(mentoradaVisivel({ mentorada: true })).toBe(true);
    expect(mentoradaVisivel({ mentorada: "true" })).toBe(true);
  });

  it("mostra quando não há flag (retrocompatível) ou metadata ausente", () => {
    expect(mentoradaVisivel({})).toBe(true);
    expect(mentoradaVisivel({ origem_cadastro: "asaas" })).toBe(true);
    expect(mentoradaVisivel(null)).toBe(true);
    expect(mentoradaVisivel(undefined)).toBe(true);
  });
});
