import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

/**
 * Fake in-memory do cliente Supabase para testes de integração das rotas.
 *
 * Suporta o subconjunto do query builder usado pelas rotas:
 *   from(t).select(cols).eq(c,v)...limit(n)          → { data: Row[], error }
 *   from(t).insert(row|rows)[.select().single()]     → { data, error }  (+ 23505)
 *   from(t).update(row).eq(c,v)[.select().single()]  → { data, error }
 *
 * Aplica UNIQUE por tabela (para simular idempotência e dedupe reais) e gera
 * id/uuid sintético nos inserts. Não é um Postgres — cobre só o necessário.
 */

type Row = Record<string, unknown>;

const UNIQUES: Record<string, string[][]> = {
  eventos_processados: [["origem", "evento_id_externo"]],
  pagamentos: [["origem", "referencia_externa"]],
  reunioes: [["origem", "referencia_externa"]],
  materiais: [["referencia_externa"]],
  estado_integracoes: [["chave"]],
  alunas: [["email"]],
};

let contador = 0;
function novoId(): string {
  contador += 1;
  return `id-${contador}`;
}

interface Resultado {
  data: unknown;
  error: { code?: string; message: string } | null;
}

class Consulta {
  private modo: "select" | "insert" | "update" = "select";
  private eqs: [string, unknown][] = [];
  private aInserir: Row[] = [];
  private aAtualizar: Row = {};
  private retornar = false;
  private umSo = false;
  private lim: number | undefined;

  constructor(
    private readonly tabela: string,
    private readonly store: Record<string, Row[]>,
  ) {}

  select(_cols?: string): this {
    this.retornar = true;
    return this;
  }
  insert(linhas: Row | Row[]): this {
    this.modo = "insert";
    this.aInserir = Array.isArray(linhas) ? linhas : [linhas];
    return this;
  }
  update(linha: Row): this {
    this.modo = "update";
    this.aAtualizar = linha;
    return this;
  }
  eq(coluna: string, valor: unknown): this {
    this.eqs.push([coluna, valor]);
    return this;
  }
  limit(n: number): this {
    this.lim = n;
    return this;
  }
  single(): this {
    this.umSo = true;
    return this;
  }
  maybeSingle(): this {
    this.umSo = true;
    return this;
  }

  private linhas(): Row[] {
    const atual = this.store[this.tabela] ?? [];
    this.store[this.tabela] = atual;
    return atual;
  }

  private casa(row: Row): boolean {
    return this.eqs.every(([c, v]) => row[c] === v);
  }

  private violaUnique(row: Row): boolean {
    const uniques = UNIQUES[this.tabela] ?? [];
    return uniques.some(
      (cols) =>
        cols.every((c) => row[c] !== null && row[c] !== undefined) &&
        this.linhas().some((r) => cols.every((c) => r[c] === row[c])),
    );
  }

  private executar(): Resultado {
    const linhas = this.linhas();

    if (this.modo === "select") {
      let achados = linhas.filter((r) => this.casa(r));
      if (this.lim !== undefined) achados = achados.slice(0, this.lim);
      return { data: this.umSo ? (achados[0] ?? null) : achados, error: null };
    }

    if (this.modo === "insert") {
      const inseridos: Row[] = [];
      for (const bruto of this.aInserir) {
        const row: Row = { id: novoId(), ...bruto };
        if (this.violaUnique(row)) {
          return {
            data: null,
            error: { code: "23505", message: "duplicate key value" },
          };
        }
        linhas.push(row);
        inseridos.push(row);
      }
      if (!this.retornar) return { data: null, error: null };
      return { data: this.umSo ? (inseridos[0] ?? null) : inseridos, error: null };
    }

    // update
    const alvo = linhas.filter((r) => this.casa(r));
    for (const r of alvo) Object.assign(r, this.aAtualizar);
    if (!this.retornar) return { data: null, error: null };
    return { data: this.umSo ? (alvo[0] ?? null) : alvo, error: null };
  }

  then(
    aoResolver: (v: Resultado) => unknown,
    aoRejeitar?: (motivo: unknown) => unknown,
  ): Promise<unknown> {
    return Promise.resolve(this.executar()).then(aoResolver, aoRejeitar);
  }
}

export interface FakeSupabase {
  client: SupabaseClient<Database>;
  store: Record<string, Row[]>;
}

/** Cria um fake com sementes opcionais por tabela. */
export function criarFakeSupabase(sementes: Record<string, Row[]> = {}): FakeSupabase {
  const store: Record<string, Row[]> = {};
  for (const [tabela, rows] of Object.entries(sementes)) {
    store[tabela] = rows.map((r) => ({ ...r }));
  }
  const client = {
    from(tabela: string): Consulta {
      return new Consulta(tabela, store);
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, store };
}
