import { describe, it, expect } from "vitest";
import { estadoTarefa, ordenarTarefas } from "@/lib/tarefas/carregar";

describe("estadoTarefa", () => {
  it("mapeia concluida e removida; o resto é aberta", () => {
    expect(estadoTarefa("concluida")).toBe("concluida");
    expect(estadoTarefa("removida")).toBe("removida");
    expect(estadoTarefa("em_andamento")).toBe("aberta");
    expect(estadoTarefa(null)).toBe("aberta");
    expect(estadoTarefa("qualquer_outro")).toBe("aberta");
  });
});

describe("ordenarTarefas", () => {
  const t = (id: string, status: string | null, criado_em: string | null) => ({
    id,
    status,
    criado_em,
  });

  it("agrupa por estado (aberta < concluida < removida)", () => {
    const ordenadas = ordenarTarefas([
      t("removida", "removida", "2026-09-01T00:00:00Z"),
      t("concluida", "concluida", "2026-09-01T00:00:00Z"),
      t("aberta", "em_andamento", "2026-09-01T00:00:00Z"),
    ]);
    expect(ordenadas.map((x) => x.id)).toEqual(["aberta", "concluida", "removida"]);
  });

  it("dentro do grupo, mais recentes primeiro", () => {
    const ordenadas = ordenarTarefas([
      t("velha", "em_andamento", "2026-08-01T00:00:00Z"),
      t("nova", "em_andamento", "2026-09-01T00:00:00Z"),
    ]);
    expect(ordenadas.map((x) => x.id)).toEqual(["nova", "velha"]);
  });

  it("não muta o array de entrada", () => {
    const entrada = [t("a", "em_andamento", "2026-08-01T00:00:00Z")];
    const copia = [...entrada];
    ordenarTarefas(entrada);
    expect(entrada).toEqual(copia);
  });

  it("tolera criado_em nulo (vai pro fim do grupo)", () => {
    const ordenadas = ordenarTarefas([
      t("sem_data", "em_andamento", null),
      t("com_data", "em_andamento", "2026-09-01T00:00:00Z"),
    ]);
    expect(ordenadas.map((x) => x.id)).toEqual(["com_data", "sem_data"]);
  });
});
