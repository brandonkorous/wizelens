// SQL dialects for the stats tables: Postgres and PGlite (cloud small mode, `$n`), SQLite (hub, `?`), and ClickHouse (cloud scale mode, `{pN:Type}`).

export type DialectName = "pg" | "sqlite" | "ch";

export interface Dialect {
  name: DialectName;
  /** The project column: project_id on the cloud, project on the hub. */
  project: string;
}

export const PG_DIALECT: Dialect = { name: "pg", project: "project_id" };
export const SQLITE_DIALECT: Dialect = { name: "sqlite", project: "project" };
/** ClickHouse reads views with the Postgres table names, so the same SQL reads merged rows. */
export const CH_DIALECT: Dialect = { name: "ch", project: "project_id" };

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
    if (this.d.name === "ch") return `{p${this.params.length}:${chType(v)}}`;
    return this.d.name === "pg" ? `$${this.params.length}` : "?";
  }

  /** `col` is one of `values`. */
  in(col: string, values: readonly string[]): string {
    if (this.d.name === "pg") return `${col} = ANY(${this.p(values.map((v) => paramOf(this.d, v)))})`;
    if (this.d.name === "ch") return `has(${this.p([...values])}, ${col})`;
    return `${col} IN (SELECT value FROM json_each(${this.p(JSON.stringify(values))}))`;
  }

  /** `col` starts with `prefix`, case-sensitive. Lengths count code points, as SQL substr does. */
  startsWith(col: string, prefix: string): string {
    if (this.d.name === "ch") return `startsWith(${col}, ${this.p(prefix)})`;
    return `substr(${col}, 1, ${lit([...prefix].length)}) = ${this.p(prefix)}`;
  }

  /** `col` holds `part`, case-sensitive. ClickHouse uses LIKE, which its n-gram indexes can answer. */
  contains(col: string, part: string): string {
    if (this.d.name === "ch") return `${col} LIKE ${this.p(`%${part.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)}`;
    return this.d.name === "pg" ? `strpos(${col}, ${this.p(part)}) > 0` : `instr(${col}, ${this.p(part)}) > 0`;
  }

  /** `col` matches literal pieces with "any text" between them (null), case-sensitive. */
  matches(col: string, pieces: readonly (string | null)[]): string {
    if (this.d.name !== "sqlite") {
      const pattern = pieces.map((s) => (s === null ? "%" : s.replace(/[\\%_]/g, (c) => `\\${c}`))).join("");
      return `${col} LIKE ${this.p(pattern)}${likeEscape(this.d)}`;
    }
    const pattern = pieces.map((s) => (s === null ? "*" : s.replace(/[*?[]/g, (c) => `[${c}]`))).join("");
    return `${col} GLOB ${this.p(pattern)}`;
  }

  /** A boolean column as a condition. */
  isTrue(col: string): string {
    return this.d.name === "sqlite" ? `${col} = 1` : col;
  }
}

/** Text order that matches JavaScript string comparison. */
export const collate = (d: Dialect, col: string): string => (d.name === "pg" ? `${col} COLLATE "C"` : col);

/** ClickHouse parameter types, from the JavaScript value. */
export function chType(v: unknown): string {
  if (Array.isArray(v)) return "Array(String)";
  if (typeof v === "number") return "Float64";
  if (typeof v === "boolean") return "Bool";
  return v === null || v === undefined ? "Nullable(String)" : "String";
}

/** The ESCAPE clause for LIKE; ClickHouse escapes with a backslash already. */
export const likeEscape = (d: Dialect): string => (d.name === "ch" ? "" : " ESCAPE '\\'");

/** Lowercase text the way JavaScript does for non-ASCII too, where the database can. */
export const lowerOf = (d: Dialect, expr: string): string => (d.name === "ch" ? `lowerUTF8(${expr})` : `lower(${expr})`);

/** A value as text. */
export const textOf = (d: Dialect, expr: string): string => (d.name === "ch" ? `toString(${expr})` : `CAST(${expr} AS TEXT)`);

/** The whole part of a non-negative expression. */
export const floorOf = (d: Dialect, expr: string): string => (d.name === "sqlite" ? `CAST(${expr} AS INTEGER)` : `FLOOR(${expr})`);

export const leastOf = (d: Dialect, a: string, b: string): string => (d.name === "sqlite" ? `min(${a}, ${b})` : `least(${a}, ${b})`);

export const greatestOf = (d: Dialect, a: string, b: string): string => (d.name === "sqlite" ? `max(${a}, ${b})` : `greatest(${a}, ${b})`);

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
