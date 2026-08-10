import { describe, it, expect } from "vitest";
import {
  priorizarFuros,
  gerarTextoBriefing,
  type FurosDaAluna,
} from "@/lib/briefing/priorizar";
import type { Furo, TipoFuro, Severidade } from "@/lib/matching/furos";

function furo(tipo: TipoFuro, severidade: Severidade, mensagem: string): Furo {
  return { tipo, severidade, mensagem, contexto: {} };
}

describe("priorizarFuros", () => {
  it("com mais de 3 furos, devolve os 3 mais urgentes na ordem de prioridade", () => {
    const entradas: FurosDaAluna[] = [
      {
        aluna: { id: "a", nome: "Ana" },
        furos: [
          furo("task_parada", "media", "Task parada"),
          furo("formulario_sem_followup", "media", "Form sem follow-up"),
        ],
      },
      {
        aluna: { id: "b", nome: "Bruna" },
        furos: [furo("assinou_sem_reuniao", "alta", "Sem reunião")],
      },
      {
        aluna: { id: "c", nome: "Carla" },
        furos: [furo("pagou_sem_contrato", "alta", "Pagou sem contrato")],
      },
      {
        aluna: { id: "f", nome: "Fernanda" },
        furos: [furo("assinatura_rejeitada", "critica", "Rejeitada")],
      },
    ];

    const top = priorizarFuros(entradas, 3);
    expect(top).toHaveLength(3);
    expect(top.map((p) => p.furo.tipo)).toEqual([
      "assinatura_rejeitada",
      "pagou_sem_contrato",
      "assinou_sem_reuniao",
    ]);
    expect(top[0]?.aluna.nome).toBe("Fernanda");
  });

  it("sem furos, devolve lista vazia", () => {
    expect(priorizarFuros([], 3)).toEqual([]);
  });
});

describe("gerarTextoBriefing", () => {
  it("zero furos → mensagem de tudo em dia", () => {
    const texto = gerarTextoBriefing([]);
    expect(texto).toContain("Bom dia, Adriana.");
    expect(texto).toContain("Tudo em dia");
  });

  it("com furos → 'Bom dia, Adriana. N coisas pra hoje' + lista", () => {
    const top = priorizarFuros(
      [
        {
          aluna: { id: "f", nome: "Fernanda Alves" },
          furos: [
            furo(
              "assinatura_rejeitada",
              "critica",
              "Assinatura rejeitada. Contato imediato.",
            ),
          ],
        },
        {
          aluna: { id: "c", nome: "Carla Souza" },
          furos: [furo("assinou_sem_reuniao", "alta", "Assinou mas não tem reunião.")],
        },
      ],
      3,
    );
    const texto = gerarTextoBriefing(top);
    expect(texto).toContain("Bom dia, Adriana. 2 coisas pra hoje:");
    expect(texto).toContain(
      "1. Fernanda Alves — Assinatura rejeitada. Contato imediato.",
    );
    expect(texto).toContain("2. Carla Souza — Assinou mas não tem reunião.");
  });

  it("um único furo usa singular ('1 coisa')", () => {
    const top = priorizarFuros(
      [
        {
          aluna: { id: "f", nome: "Fernanda" },
          furos: [furo("assinatura_rejeitada", "critica", "x")],
        },
      ],
      3,
    );
    expect(gerarTextoBriefing(top)).toContain("1 coisa pra hoje");
  });

  it("inclui o resumo da agenda no final, depois das pendências", () => {
    const top = priorizarFuros(
      [
        {
          aluna: { id: "f", nome: "Fernanda" },
          furos: [furo("assinatura_rejeitada", "critica", "Rejeitada.")],
        },
      ],
      3,
    );
    const texto = gerarTextoBriefing(top, [
      { hora: "10:00", titulo: "Mentoria Paula" },
      { hora: "15:00", titulo: "Call 4E" },
    ]);
    expect(texto).toContain(
      "Na sua agenda hoje: 2 compromissos — 10:00 Mentoria Paula; 15:00 Call 4E.",
    );
    // agenda vem depois da pendência
    expect(texto.indexOf("Fernanda")).toBeLessThan(texto.indexOf("agenda hoje"));
  });

  it("sem compromissos, não adiciona a seção de agenda", () => {
    const texto = gerarTextoBriefing([], []);
    expect(texto).not.toContain("agenda hoje");
  });

  it("tudo em dia mas com agenda → mostra os dois", () => {
    const texto = gerarTextoBriefing([], [{ hora: "14:00", titulo: "Reunião X" }]);
    expect(texto).toContain("Tudo em dia");
    expect(texto).toContain("Na sua agenda hoje: 1 compromisso — 14:00 Reunião X.");
  });
});
