import { describe, it, expect } from "vitest";
import { intervaloSemanaSP, inicioDeHojeSP } from "@/lib/tempo";

/** Dia da semana (0=domingo … 6=sábado) de um instante ISO, em SP. */
function diaDaSemanaSP(iso: string): number {
  // O instante "…T00:00:00-03:00" é 03:00Z do MESMO dia → getUTCDay bate com SP.
  return new Date(iso).getUTCDay();
}

describe("intervaloSemanaSP", () => {
  it("hoje é segunda: início = hoje, fim = segunda seguinte", () => {
    // 2026-08-10 é segunda-feira.
    const { inicio, fim } = intervaloSemanaSP(new Date("2026-08-10T09:00:00-03:00"));
    expect(inicio).toBe("2026-08-10T00:00:00-03:00");
    expect(fim).toBe("2026-08-17T00:00:00-03:00");
  });

  it("hoje é domingo: início continua sendo a segunda anterior", () => {
    // 2026-08-16 é domingo (fim da semana que começou em 10/08).
    const { inicio, fim } = intervaloSemanaSP(new Date("2026-08-16T23:00:00-03:00"));
    expect(inicio).toBe("2026-08-10T00:00:00-03:00");
    expect(fim).toBe("2026-08-17T00:00:00-03:00");
  });

  it("atravessa a virada de mês", () => {
    // 2026-09-02 é quarta; a semana começou na segunda 2026-08-31.
    const { inicio, fim } = intervaloSemanaSP(new Date("2026-09-02T12:00:00-03:00"));
    expect(inicio).toBe("2026-08-31T00:00:00-03:00");
    expect(fim).toBe("2026-09-07T00:00:00-03:00");
  });

  it("invariantes: início é segunda, dura 7 dias e contém o agora", () => {
    for (const iso of [
      "2026-08-10T09:00:00-03:00",
      "2026-08-16T23:00:00-03:00",
      "2026-09-02T12:00:00-03:00",
      "2027-01-01T06:30:00-03:00",
    ]) {
      const agora = new Date(iso);
      const { inicio, fim } = intervaloSemanaSP(agora);
      expect(diaDaSemanaSP(inicio)).toBe(1); // segunda-feira
      const dias =
        (new Date(fim).getTime() - new Date(inicio).getTime()) / (24 * 60 * 60 * 1000);
      expect(dias).toBe(7);
      expect(new Date(inicio).getTime()).toBeLessThanOrEqual(agora.getTime());
      expect(agora.getTime()).toBeLessThan(new Date(fim).getTime());
    }
  });

  it("inicioDeHojeSP usa a data-calendário de SP", () => {
    // 22:00-03:00 do dia 10 ainda é dia 10 em SP.
    expect(inicioDeHojeSP(new Date("2026-08-10T22:00:00-03:00"))).toBe(
      "2026-08-10T00:00:00-03:00",
    );
    // 00:30Z do dia 11 é 21:30-03:00 do dia 10 em SP → ainda dia 10.
    expect(inicioDeHojeSP(new Date("2026-08-11T00:30:00Z"))).toBe(
      "2026-08-10T00:00:00-03:00",
    );
  });
});
