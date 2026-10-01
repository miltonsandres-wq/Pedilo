import type { PGlite } from "@electric-sql/pglite";
import { comoUsuario } from "../sql/harness";

/**
 * Sustituye a supabase-js en las pruebas: ejecuta las consultas y RPCs contra
 * el Postgres real (PGlite con las migraciones), como el usuario indicado, así
 * corren los triggers, las RPCs y la RLS de verdad.
 */
export const servidor: { pg: PGlite | null; userId: string; caido: boolean } = {
  pg: null,
  userId: "",
  caido: false,
};

type Resultado = { data: unknown; error: { message: string } | null };
const SIN_RED: Resultado = { data: null, error: { message: "TypeError: Failed to fetch" } };

class Consulta implements PromiseLike<Resultado> {
  private filtros: string[] = [];
  private valores: unknown[] = [];
  private orden = "";
  private tope = "";
  private modo: "todos" | "single" | "maybe" = "todos";
  private cambios: Record<string, unknown> | null = null;
  constructor(private tabla: string) {}

  select(_columnas?: string) {
    void _columnas;
    return this;
  }
  eq(col: string, valor: unknown) {
    this.valores.push(valor);
    this.filtros.push(`${col} = $${this.valores.length}`);
    return this;
  }
  gte(col: string, valor: unknown) {
    this.valores.push(valor);
    this.filtros.push(`${col} >= $${this.valores.length}`);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orden = ` order by ${col} ${opts?.ascending === false ? "desc" : "asc"}`;
    return this;
  }
  limit(n: number) {
    this.tope = ` limit ${n}`;
    return this;
  }
  /** update(valores).eq(...): corre el UPDATE real (con triggers y RLS) y devuelve el error si la base lo rechaza. */
  update(valores: Record<string, unknown>) {
    this.cambios = valores;
    return this;
  }
  single() {
    this.modo = "single";
    return this;
  }
  maybeSingle() {
    this.modo = "maybe";
    return this;
  }

  private async ejecutar(): Promise<Resultado> {
    if (servidor.caido) return SIN_RED;
    const donde = this.filtros.length ? ` where ${this.filtros.join(" and ")}` : "";
    if (this.cambios) {
      const claves = Object.keys(this.cambios);
      const set = claves.map((k, i) => `${k} = $${this.valores.length + i + 1}`).join(", ");
      const params = [...this.valores, ...claves.map((k) => this.cambios![k])];
      try {
        await comoUsuario(servidor.pg!, servidor.userId, () =>
          servidor.pg!.query(`update public.${this.tabla} set ${set}${donde}`, params)
        );
        return { data: null, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    }
    const sql = `select * from public.${this.tabla}${donde}${this.orden}${this.tope}`;
    try {
      const r = await comoUsuario(servidor.pg!, servidor.userId, () => servidor.pg!.query(sql, this.valores));
      if (this.modo === "single") {
        return r.rows.length === 1 ? { data: r.rows[0], error: null } : { data: null, error: { message: "no rows" } };
      }
      if (this.modo === "maybe") return { data: r.rows[0] ?? null, error: null };
      return { data: r.rows, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  }

  then<T1 = Resultado, T2 = never>(
    onfulfilled?: ((v: Resultado) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return this.ejecutar().then(onfulfilled, onrejected);
  }
}

export function crearClienteFalso() {
  return {
    from: (tabla: string) => new Consulta(tabla),
    async rpc(fn: string, args: Record<string, unknown> = {}): Promise<Resultado> {
      if (servidor.caido) return SIN_RED;
      const claves = Object.keys(args);
      const params = claves.map((k, i) => `${k} => $${i + 1}${typeof args[k] === "object" ? "::jsonb" : ""}`);
      const valores = claves.map((k) => (typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
      try {
        const r = await comoUsuario(servidor.pg!, servidor.userId, () =>
          servidor.pg!.query<Record<string, unknown>>(`select * from public.${fn}(${params.join(", ")})`, valores)
        );
        const fila = r.rows[0] ?? {};
        const llaves = Object.keys(fila);
        return { data: llaves.length === 1 && llaves[0] === fn ? fila[fn] : fila, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  };
}
