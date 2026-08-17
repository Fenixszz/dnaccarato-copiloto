import { describe, it, expect, afterEach } from "vitest";
import {
  estimarCustoAnthropicCentavos,
  custoWhatsappCentavos,
  tarifasDoEnv,
  type Tarifas,
} from "@/lib/creditos/custos";

const TARIFAS: Tarifas = {
  anthropicInputCentavosPorMTok: 2700,
  anthropicOutputCentavosPorMTok: 13500,
  whatsappCentavosPorMsg: 5,
};

describe("estimarCustoAnthropicCentavos", () => {
  it("soma input e output pela tarifa, arredondando pra cima", () => {
    // 1M input (2700) + 1M output (13500) = 16200 centavos.
    expect(
      estimarCustoAnthropicCentavos(
        { inputTokens: 1_000_000, outputTokens: 1_000_000 },
        TARIFAS,
      ),
    ).toBe(16200);
  });

  it("uso pequeno arredonda pra cima (nunca subestima)", () => {
    // 1000 input * 2700 / 1e6 = 2.7 → 3 centavos.
    expect(
      estimarCustoAnthropicCentavos({ inputTokens: 1000, outputTokens: 0 }, TARIFAS),
    ).toBe(3);
  });

  it("cache read a 0,1x e cache creation a 1,25x do input", () => {
    // 1M cacheRead: 2700*0.1=270; 1M cacheCreation: 2700*1.25=3375 → 3645.
    expect(
      estimarCustoAnthropicCentavos(
        {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 1_000_000,
          cacheCreationTokens: 1_000_000,
        },
        TARIFAS,
      ),
    ).toBe(3645);
  });

  it("nunca retorna negativo mesmo com valores estranhos", () => {
    expect(
      estimarCustoAnthropicCentavos({ inputTokens: -50, outputTokens: -50 }, TARIFAS),
    ).toBe(0);
  });
});

describe("custoWhatsappCentavos", () => {
  it("retorna a tarifa por mensagem", () => {
    expect(custoWhatsappCentavos(TARIFAS)).toBe(5);
  });
});

describe("tarifasDoEnv", () => {
  afterEach(() => {
    delete process.env.CREDITO_ANTHROPIC_INPUT_CENTAVOS_POR_MTOK;
    delete process.env.CREDITO_WHATSAPP_CENTAVOS_POR_MSG;
  });

  it("usa defaults quando não há env", () => {
    const t = tarifasDoEnv();
    expect(t.anthropicInputCentavosPorMTok).toBe(2700);
    expect(t.anthropicOutputCentavosPorMTok).toBe(13500);
    expect(t.whatsappCentavosPorMsg).toBe(5);
  });

  it("respeita override do env", () => {
    process.env.CREDITO_ANTHROPIC_INPUT_CENTAVOS_POR_MTOK = "3000";
    process.env.CREDITO_WHATSAPP_CENTAVOS_POR_MSG = "8";
    const t = tarifasDoEnv();
    expect(t.anthropicInputCentavosPorMTok).toBe(3000);
    expect(t.whatsappCentavosPorMsg).toBe(8);
  });
});
