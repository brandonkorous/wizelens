import type { BetterAuthOptions } from "better-auth";
import type { Kysely, Transaction } from "kysely";
import type { Pool, PoolClient } from "pg";

/** Something that runs SQL: the database, or one transaction. Postgres syntax, `$1` parameters. */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  /** Run `fn` in one transaction. It rolls back when `fn` throws. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Run several statements without parameters (migrations, before anything else uses the database). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  readonly kind: "postgres" | "pglite";
  /** The same database, for Better Auth. */
  readonly authDatabase: NonNullable<BetterAuthOptions["database"]>;
}

const wrap = (client: Pool | PoolClient): Queryable => ({
  query: async <T>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as T[],
});

/** A managed Postgres, from a `postgres://` URL. */
export async function openPostgres(url: string): Promise<Db> {
  const { default: pg } = await import("pg");
  // Times are double precision (no bigint parsing); the timeouts free connections that a runaway query or a gone client holds.
  const pool = new pg.Pool({ connectionString: url, max: 10, statement_timeout: 120_000, idle_in_transaction_session_timeout: 60_000 });
  return {
    kind: "postgres",
    authDatabase: pool,
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

/** PGlite (a folder, or memory), for tests and trials. All queries share one Kysely queue with Better Auth: PGlite has one connection. */
export async function openPglite(dir?: string): Promise<Db> {
  const [{ PGlite }, { Kysely, CompiledQuery }, { PGliteDialect }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("kysely"),
    import("kysely-pglite-dialect"),
  ]);
  const lite = await PGlite.create(dir);
  const kysely: Kysely<unknown> = new Kysely({ dialect: new PGliteDialect(lite) });
  const run = (k: Kysely<unknown> | Transaction<unknown>): Queryable => ({
    query: async <T>(sql: string, params: unknown[] = []) => (await k.executeQuery<T>(CompiledQuery.raw(sql, params))).rows,
  });
  return {
    kind: "pglite",
    authDatabase: { db: kysely, type: "postgres", transaction: true },
    ...run(kysely),
    tx: <T>(fn: (q: Queryable) => Promise<T>) => kysely.transaction().execute((t) => fn(run(t))),
    exec: async (sql) => void (await lite.exec(sql)),
    close: () => kysely.destroy(),
  };
}

/** "postgres://..." opens Postgres; "pglite:<folder>" or "memory" opens PGlite. */
export function openDb(url: string): Promise<Db> {
  if (/^postgres(ql)?:\/\//i.test(url)) return openPostgres(url);
  if (url === "memory") return openPglite();
  if (url.startsWith("pglite:")) return openPglite(url.slice("pglite:".length));
  throw new Error(`Unknown database URL "${url}". Use postgres://..., pglite:<folder>, or memory.`);
}
