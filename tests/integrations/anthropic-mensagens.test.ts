import { describe, it, expect } from "vitest";
import { paraMensagensApi } from "@/lib/integrations/anthropic";

describe("paraMensagensApi", () => {
  it("mapeia autor → role e preserva ordem/conteúdo", () => {
    expect(
      paraMensagensApi([
        { autor: "usuario", texto: "oi" },
        { autor: "assistente", texto: "olá!" },
        { autor: "usuario", texto: "tudo bem?" },
      ]),
    ).toEqual([
      { role: "user", content: "oi" },
      { role: "assistant", content: "olá!" },
      { role: "user", content: "tudo bem?" },
    ]);
  });

  it("lista vazia → vazia", () => {
    expect(paraMensagensApi([])).toEqual([]);
  });
});
