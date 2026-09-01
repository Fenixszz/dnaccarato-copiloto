import { describe, it, expect } from "vitest";
import { combinarProximasReunioes, type ReuniaoUnificada } from "@/lib/reunioes/proximas";

const SEMANA = { inicio: "2026-09-01T00:00:00Z", fim: "2026-09-08T00:00:00Z" };

const cal = (id: string, iso: string, titulo = "Aluna"): ReuniaoUnificada => ({
  id,
  data_hora: iso,
  titulo,
  fonte: "calendly",
});
const ag = (id: string, iso: string, titulo = "Evento"): ReuniaoUnificada => ({
  id,
  data_hora: iso,
  titulo,
  fonte: "agenda",
});

describe("combinarProximasReunioes", () => {
  it("junta as duas fontes e ordena por horário", () => {
    const { proximas } = combinarProximasReunioes(
      [ag("a", "2026-09-03T14:00:00Z"), cal("c", "2026-09-02T10:00:00Z")],
      SEMANA,
    );
    expect(proximas.map((r) => r.id)).toEqual(["c", "a"]);
  });

  it("deduplica o mesmo instante preferindo o Calendly (tem o nome da aluna)", () => {
    const { proximas } = combinarProximasReunioes(
      [
        ag("espelho", "2026-09-02T10:00:00Z", "Reunião Fulana"),
        cal("real", "2026-09-02T10:00:00Z", "Fulana"),
      ],
      SEMANA,
    );
    expect(proximas).toHaveLength(1);
    expect(proximas[0]?.fonte).toBe("calendly");
    expect(proximas[0]?.titulo).toBe("Fulana");
  });

  it("dedup vale mesmo se a Agenda vier antes na lista", () => {
    const { proximas } = combinarProximasReunioes(
      [cal("real", "2026-09-02T10:00:00Z"), ag("espelho", "2026-09-02T10:00:30Z")],
      SEMANA,
    );
    // 10:00:00 e 10:00:30 caem no mesmo minuto → um só, Calendly.
    expect(proximas).toHaveLength(1);
    expect(proximas[0]?.id).toBe("real");
  });

  it("conta só as reuniões dentro da semana", () => {
    const { totalSemana } = combinarProximasReunioes(
      [
        cal("dentro1", "2026-09-01T09:00:00Z"),
        ag("dentro2", "2026-09-05T09:00:00Z"),
        cal("fora", "2026-09-10T09:00:00Z"),
      ],
      SEMANA,
    );
    expect(totalSemana).toBe(2);
  });

  it("corta a lista exibida em `limite` mas conta a semana toda", () => {
    const itens = Array.from({ length: 5 }, (_, i) =>
      cal(`r${i}`, `2026-09-0${i + 1}T09:00:00Z`),
    );
    const { proximas, totalSemana } = combinarProximasReunioes(itens, SEMANA, 2);
    expect(proximas).toHaveLength(2);
    expect(totalSemana).toBe(5);
  });
});
