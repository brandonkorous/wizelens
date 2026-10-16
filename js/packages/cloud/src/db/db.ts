import type { PGlite } from "@electric-sql/pglite";
import type { Pool, PoolClient } from "pg";

/** Something that runs SQL: the database, or one transaction. Postgres syntax, `$1` parameters. */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  /** Run `fn` in one transaction. It rolls back when `fn` throws. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Run several statements without parameters (migrations). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  readonly kind: "postgres" | "pglite";
}

const wrap = (client: Pool | PoolClient): Queryable => ({
  query: async <T>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as T[],
});

/** A managed Postgres, from a `postgres://` URL. */
export async function openPostgres(url: string): Promise<Db> {
  const { default: pg } = await import("pg");
  // Times are stored as double precision, so no bigint parsing is needed.
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  return {
    kind: "postgres",
    ...wrap(pool),
    async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(wrap(client));
        await client.query("COMMIT");
        return out;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
    exec: async (sql) => void (await pool.query(sql)),
    close: () => pool.end(),
  };
}

/** Postgres in this process (PGlite): a folder on disk, or memory when `dir` is undefined. For tests and trials. */
export async function openPglite(dir?: string): Promise<Db> {
  const { PGlite: Lite } = await import("@electric-sql/pglite");
  const lite: PGlite = await Lite.create(dir);
  const q = (runner: Pick<PGlite, "query">): Queryable => ({
    query: async <T>(sql: string, params: unknown[] = []) => (await runner.query<T>(sql, params)).rows,
  });
  return {
    kind: "pglite",
    ...q(lite),
    tx: <T>(fn: (q: Queryable) => Promise<T>) => lite.transaction((t) => fn(q(t))),
    exec: async (sql) => void (await lite.exec(sql)),
    close: () => lite.close(),
  };
}

/** "postgres://..." opens Postgres; "pglite:<folder>" or "memory" opens PGlite. */
export function openDb(url: string): Promise<Db> {
  if (/^postgres(ql)?:\/\//i.test(url)) return openPostgres(url);
  if (url === "memory") return openPglite();
  if (url.startsWith("pglite:")) return openPglite(url.slice("pglite:".length));
  throw new Error(`Unknown database URL "${url}". Use postgres://..., pglite:<folder>, or memory.`);
}
