import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

/**
 * Fake in-memory do cliente Supabase para testes de integração das rotas.
 *
 * Suporta o subconjunto do query builder usado pelas rotas:
 *   from(t).select(cols).eq(c,v).in(c,vs).gte(c,v).lt(c,v)...limit(n)
 *                                                    → { data: Row[], error }
 *   from(t).select("*", { count, head }).<filtros>   → { data, count, error }
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
  documentos: [["origem", "documento_id_externo"]],
  reunioes: [["origem", "referencia_externa"]],
  materiais: [["referencia_externa"]],
  tasks_asana: [["task_id"]],
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
  count?: number | null;
  error: { code?: string; message: string } | null;
}

/** Compara dois valores tratando strings de data como instantes. */
function comparar(a: unknown, b: unknown): number {
  const ta = Date.parse(String(a));
  const tb = Date.parse(String(b));
  if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

class Consulta {
  private modo: "select" | "insert" | "update" | "delete" = "select";
  private eqs: [string, unknown][] = [];
  private ins: [string, unknown[]][] = [];
  private gtes: [string, unknown][] = [];
  private lts: [string, unknown][] = [];
  // Cada `.or(...)` vira um grupo de condições (OR interno); grupos são ANDados.
  private ors: string[][] = [];
  private aInserir: Row[] = [];
  private aAtualizar: Row = {};
  private retornar = false;
  private umSo = false;
  private contar = false;
  private head = false;
  private lim: number | undefined;

  constructor(
    private readonly tabela: string,
    private readonly store: Record<string, Row[]>,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }): this {
    this.retornar = true;
    if (opts?.count !== undefined) this.contar = true;
    if (opts?.head === true) this.head = true;
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
  delete(): this {
    this.modo = "delete";
    return this;
  }
  eq(coluna: string, valor: unknown): this {
    this.eqs.push([coluna, valor]);
    return this;
  }
  in(coluna: string, valores: unknown[]): this {
    this.ins.push([coluna, valores]);
    return this;
  }
  gte(coluna: string, valor: unknown): this {
    this.gtes.push([coluna, valor]);
    return this;
  }
  lt(coluna: string, valor: unknown): this {
    this.lts.push([coluna, valor]);
    return this;
  }
  or(condicoes: string): this {
    this.ors.push(condicoes.split(","));
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

  /** Resolve o valor de uma coluna, suportando o path JSON `campo->>chave`. */
  private valorColuna(row: Row, col: string): unknown {
    if (col.includes("->>")) {
      const [campo = "", chave = ""] = col.split("->>");
      const obj = row[campo];
      return obj !== null && typeof obj === "object"
        ? (obj as Record<string, unknown>)[chave]
        : undefined;
    }
    return row[col];
  }

  /** Avalia UMA condição do formato PostgREST `coluna.operador.valor`. */
  private avaliaCondicao(row: Row, cond: string): boolean {
    const partes = cond.split(".");
    const col = partes[0] ?? "";
    const op = partes[1] ?? "";
    const val = partes.slice(2).join(".");
    const atual = this.valorColuna(row, col);
    if (op === "is") return val === "null" && (atual === null || atual === undefined);
    if (op === "neq") return String(atual) !== val;
    if (op === "eq") return String(atual) === val;
    return false;
  }

  private casa(row: Row): boolean {
    return (
      this.eqs.every(([c, v]) => row[c] === v) &&
      this.ins.every(([c, vs]) => vs.includes(row[c])) &&
      this.gtes.every(([c, v]) => comparar(row[c], v) >= 0) &&
      this.lts.every(([c, v]) => comparar(row[c], v) < 0) &&
      this.ors.every((grupo) => grupo.some((cond) => this.avaliaCondicao(row, cond)))
    );
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
      // count/head: retorna só o total (head=true não traz linhas).
      if (this.contar || this.head) {
        return { data: this.head ? null : achados, count: achados.length, error: null };
      }
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

    if (this.modo === "delete") {
      const removidos = linhas.filter((r) => this.casa(r));
      const restantes = linhas.filter((r) => !this.casa(r));
      this.store[this.tabela] = restantes;
      if (!this.retornar) return { data: null, error: null };
      return { data: this.umSo ? (removidos[0] ?? null) : removidos, error: null };
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
