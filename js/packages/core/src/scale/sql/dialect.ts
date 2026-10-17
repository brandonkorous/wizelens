// SQL dialects for the stats tables: Postgres and PGlite (cloud, `$n` parameters) and SQLite (hub, `?` parameters).

export type DialectName = "pg" | "sqlite";

export interface Dialect {
  name: DialectName;
  /** The project column: project_id on the cloud, project on the hub. */
  project: string;
}

export const PG_DIALECT: Dialect = { name: "pg", project: "project_id" };
export const SQLITE_DIALECT: Dialect = { name: "sqlite", project: "project" };

/** Runs one read and returns its rows. Hosts wrap their driver (async pg, or sync node:sqlite). */
export interface SqlRunner {
  all(sql: string, params: readonly unknown[]): Promise<Record<string, unknown>[]>;
}

/** One write, ready for the host's driver. */
export interface Statement {
  sql: string;
  params: unknown[];
}

/** Which project and environment a query reads. Empty or missing means all (the hub); the cloud always sets a project. */
export interface SqlScope {
  project?: string;
  env?: string;
}

/** Where reads go: the dialect, the driver, and the scope. */
export interface SqlSource {
  d: Dialect;
  run: SqlRunner;
  scope: SqlScope;
}

/** A parameter as the driver takes it: SQLite has no booleans, and Postgres text cannot hold NUL. */
export function paramOf(d: Dialect, v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return d.name === "sqlite" ? (v ? 1 : 0) : v;
  if (typeof v === "string" && d.name === "pg" && v.includes("\u0000")) return v.replaceAll("\u0000", "�");
  return v;
}

/** A number written into SQL text. Only for numbers the code computes, never for input. */
export function lit(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`Not a finite number: ${v}`);
  return String(v);
}

/** Collects parameters in text order, so the same builder serves `$n` and `?`. */
export class SqlText {
  readonly params: unknown[] = [];

  constructor(readonly d: Dialect) {}

  /** A parameter placeholder for `v`. Call it in the order the text reads. */
  p(v: unknown): string {
    this.params.push(paramOf(this.d, v));
    return this.d.name === "pg" ? `$${this.params.length}` : "?";
  }

  /** `col` is one of `values`. */
  in(col: string, values: readonly string[]): string {
    if (this.d.name === "pg") return `${col} = ANY(${this.p(values.map((v) => paramOf(this.d, v)))})`;
    return `${col} IN (SELECT value FROM json_each(${this.p(JSON.stringify(values))}))`;
  }

  /** `col` starts with `prefix`, case-sensitive. Lengths count code points, as SQL substr does. */
  startsWith(col: string, prefix: string): string {
    return `substr(${col}, 1, ${lit([...prefix].length)}) = ${this.p(prefix)}`;
  }

  /** `col` holds `part`, case-sensitive. */
  contains(col: string, part: string): string {
    return this.d.name === "pg" ? `strpos(${col}, ${this.p(part)}) > 0` : `instr(${col}, ${this.p(part)}) > 0`;
  }

  /** `col` matches literal pieces with "any text" between them (null), case-sensitive. */
  matches(col: string, pieces: readonly (string | null)[]): string {
    if (this.d.name === "pg") {
      const pattern = pieces.map((s) => (s === null ? "%" : s.replace(/[\\%_]/g, (c) => `\\${c}`))).join("");
      return `${col} LIKE ${this.p(pattern)} ESCAPE '\\'`;
    }
    const pattern = pieces.map((s) => (s === null ? "*" : s.replace(/[*?[]/g, (c) => `[${c}]`))).join("");
    return `${col} GLOB ${this.p(pattern)}`;
  }

  /** A boolean column as a condition. */
  isTrue(col: string): string {
    return this.d.name === "pg" ? col : `${col} = 1`;
  }
}

/** Text order that matches JavaScript string comparison. */
export const collate = (d: Dialect, col: string): string => (d.name === "pg" ? `${col} COLLATE "C"` : col);

/** The whole part of a non-negative expression. */
export const floorOf = (d: Dialect, expr: string): string => (d.name === "pg" ? `FLOOR(${expr})` : `CAST(${expr} AS INTEGER)`);

export const leastOf = (d: Dialect, a: string, b: string): string => (d.name === "pg" ? `LEAST(${a}, ${b})` : `min(${a}, ${b})`);

export const greatestOf = (d: Dialect, a: string, b: string): string => (d.name === "pg" ? `GREATEST(${a}, ${b})` : `max(${a}, ${b})`);

/** Scope conditions on a table with the dialect's project column and an env column. */
export function scopeWhere(q: SqlText, scope: SqlScope, alias = ""): string[] {
  const out: string[] = [];
  if (scope.project) out.push(`${alias}${q.d.project} = ${q.p(scope.project)}`);
  if (scope.env) out.push(`${alias}env = ${q.p(scope.env)}`);
  return out;
}

/** A number from a row: drivers return counts as strings (pg bigint) and booleans as 0/1 (SQLite). */
export const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

export const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));

export const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export const boolOf = (v: unknown): boolean => v === true || v === 1 || v === "1" || v === "t" || v === "true";

export const whereOf = (conds: readonly string[]): string => (conds.length ? `WHERE ${conds.join(" AND ")}` : "");
