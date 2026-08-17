import { describe, it, expect, vi } from "vitest";
import { criarFakeSupabase } from "../helpers/fakeSupabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

/**
 * Integração de contarResumoDashboard: substitui o service client pelo fake
 * in-memory e confere as 4 contagens (alunas, atraso, docs pendentes/rejeitados
 * e reuniões da semana), incluindo os limites da janela da semana.
 */
const holder = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient<Database>,
}));

vi.mock("@/lib/db/client", () => ({
  getServiceClient: () => holder.client,
}));

import { contarResumoDashboard } from "@/lib/db/queries";

// Quarta-feira; a semana vai de 2026-08-10 (seg) a 2026-08-17 (seg, exclusivo).
const AGORA = new Date("2026-08-12T12:00:00-03:00");

describe("contarResumoDashboard", () => {
  it("conta cada métrica com os filtros certos", async () => {
    const fake = criarFakeSupabase({
      alunas: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
      pagamentos: [
        { status: "atrasado" },
        { status: "atrasado" },
        { status: "pago" },
        { status: "pendente" },
      ],
      documentos: [
        { status: "pendente" },
        { status: "rejeitado" },
        { status: "rejeitado" },
        { status: "assinado" },
      ],
      reunioes: [
        { data_hora: "2026-08-12T10:00:00-03:00" }, // dentro
        { data_hora: "2026-08-16T23:00:00-03:00" }, // domingo, dentro
        { data_hora: "2026-08-17T00:00:00-03:00" }, // limite superior, FORA (lt)
        { data_hora: "2026-08-09T23:00:00-03:00" }, // semana anterior, fora
        { data_hora: null }, // sem data, fora
      ],
    });
    holder.client = fake.client;

    const resumo = await contarResumoDashboard(AGORA);

    expect(resumo).toEqual({
      alunasAtivas: 3,
      pagamentosEmAtraso: 2,
      documentosPendentesRejeitados: 3,
      reunioesDaSemana: 2,
    });
  });

  it("retorna zeros quando não há dados", async () => {
    holder.client = criarFakeSupabase().client;
    const resumo = await contarResumoDashboard(AGORA);
    expect(resumo).toEqual({
      alunasAtivas: 0,
      pagamentosEmAtraso: 0,
      documentosPendentesRejeitados: 0,
      reunioesDaSemana: 0,
    });
  });
});
