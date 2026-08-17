import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { criarFakeSupabase } from "../helpers/fakeSupabase";

/**
 * Testa a lógica de anonimização (LGPD) de uma aluna: remove as tabelas-filho
 * com PII, faz scrub dos documentos retidos, anonimiza a linha da aluna e é
 * idempotente. O cliente Supabase é substituído pelo fake in-memory.
 */

const holder = vi.hoisted(() => ({
  store: {} as Record<string, Record<string, unknown>[]>,
  client: null as unknown as SupabaseClient<Database>,
}));

vi.mock("@/lib/db/client", () => ({
  getServiceClient: () => holder.client,
}));

import {
  anonimizarAluna,
  AlunaNaoEncontrada,
  NOME_ANONIMIZADO,
} from "@/lib/lgpd/anonimizar";

const ALUNA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OUTRA = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

/** Lê as linhas de uma tabela do fake (nunca undefined). */
const linhas = (tabela: string): Record<string, unknown>[] => holder.store[tabela] ?? [];

beforeEach(() => {
  const fake = criarFakeSupabase({
    alunas: [
      {
        id: ALUNA,
        nome: "Maria Silva",
        email: "maria@ex.com",
        telefone: "11999998888",
        metadata: { cpf: "123.456.789-00" },
        anonimizada_em: null,
      },
      {
        id: OUTRA,
        nome: "Joana Souza",
        email: "joana@ex.com",
        telefone: "11888887777",
        metadata: { cpf: "999.888.777-66" },
        anonimizada_em: null,
      },
    ],
    materiais: [
      { id: "m1", aluna_id: ALUNA, nome_arquivo: "rg.pdf" },
      { id: "m2", aluna_id: OUTRA, nome_arquivo: "outra.pdf" },
    ],
    formularios: [{ id: "f1", aluna_id: ALUNA, respostas: { objetivo: "x" } }],
    reunioes: [
      { id: "r1", aluna_id: ALUNA, link: "https://meet/aluna" },
      { id: "r2", aluna_id: ALUNA, link: "https://meet/aluna2" },
    ],
    tasks_asana: [{ id: "t1", aluna_id: ALUNA, task_id: "T1", titulo: "Ligar p/ Maria" }],
    documentos: [
      {
        id: "d1",
        aluna_id: ALUNA,
        tipo: "contrato",
        status: "assinado",
        assinado_em: "2026-01-01T00:00:00Z",
        documento_id_externo: "aut-1",
        link_assinado: "https://autentique/aluna",
        motivo_rejeicao: null,
      },
    ],
    pagamentos: [
      { id: "p1", aluna_id: ALUNA, origem: "asaas", status: "pago", valor: 500 },
    ],
  });
  holder.client = fake.client;
  holder.store = fake.store;
});

describe("anonimizarAluna", () => {
  it("remove as tabelas-filho com PII e conta o que apagou", async () => {
    const res = await anonimizarAluna(ALUNA);

    expect(res.anonimizada).toBe(true);
    expect(res.jaAnonimizada).toBe(false);
    expect(res.removidos).toEqual({
      materiais: 1,
      formularios: 1,
      reunioes: 2,
      tasks_asana: 1,
    });

    // nada da aluna anonimizada nessas tabelas...
    expect(linhas("materiais").filter((r) => r.aluna_id === ALUNA)).toHaveLength(0);
    expect(linhas("formularios")).toHaveLength(0);
    expect(linhas("reunioes")).toHaveLength(0);
    expect(linhas("tasks_asana")).toHaveLength(0);
    // ...mas a de OUTRA aluna intacta
    expect(linhas("materiais").filter((r) => r.aluna_id === OUTRA)).toHaveLength(1);
  });

  it("faz scrub da PII dos documentos, mantendo a prova legal", async () => {
    const res = await anonimizarAluna(ALUNA);
    expect(res.documentosLimpos).toBe(1);

    const doc = linhas("documentos")[0];
    expect(doc?.link_assinado).toBeNull();
    expect(doc?.motivo_rejeicao).toBeNull();
    // preserva o registro em si (retenção legal)
    expect(doc?.status).toBe("assinado");
    expect(doc?.documento_id_externo).toBe("aut-1");
  });

  it("mantém pagamentos (retenção financeira)", async () => {
    await anonimizarAluna(ALUNA);
    expect(linhas("pagamentos")).toHaveLength(1);
    expect(linhas("pagamentos")[0]?.valor).toBe(500);
  });

  it("anonimiza a linha da aluna (zera CPF, contatos, nome) e carimba a marca", async () => {
    await anonimizarAluna(ALUNA);
    const aluna = linhas("alunas").find((a) => a.id === ALUNA);
    expect(aluna).toBeDefined();
    expect(aluna?.nome).toBe(NOME_ANONIMIZADO);
    expect(aluna?.email).toBeNull();
    expect(aluna?.telefone).toBeNull();
    expect(aluna?.metadata).toEqual({});
    expect(aluna?.anonimizada_em).toBeTruthy();
  });

  it("não toca em outra aluna", async () => {
    await anonimizarAluna(ALUNA);
    const outra = linhas("alunas").find((a) => a.id === OUTRA);
    expect(outra?.nome).toBe("Joana Souza");
    expect(outra?.anonimizada_em).toBeNull();
  });

  it("é idempotente: aluna já anonimizada → no-op", async () => {
    await anonimizarAluna(ALUNA);
    const res2 = await anonimizarAluna(ALUNA);
    expect(res2.anonimizada).toBe(false);
    expect(res2.jaAnonimizada).toBe(true);
    expect(res2.removidos).toEqual({
      materiais: 0,
      formularios: 0,
      reunioes: 0,
      tasks_asana: 0,
    });
  });

  it("aluna inexistente → lança AlunaNaoEncontrada", async () => {
    await expect(
      anonimizarAluna("00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(AlunaNaoEncontrada);
  });
});
