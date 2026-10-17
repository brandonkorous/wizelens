import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { type Executor, SQLITE_DIALECT, type SqlRunner, sqlExecutor, type SqlScope } from "@wizeworks/lens-core";
import { settlingCount } from "./settle.js";
import type { HubStore } from "./store.js";
import { getStoredTrace } from "./store-read.js";

/** Reads for the SQL executor, on the hub's file. */
export const sqliteRunner = (db: DatabaseSync): SqlRunner => ({
  all: async (sql, params) => db.prepare(sql).all(...(params as SQLInputValue[])) as Record<string, unknown>[],
});

/** Page needs from the hub's stats tables. Scope: an optional project and environment; the 1 h tier keeps `maxAgeMs`. */
export function hubExecutor(store: HubStore, scope: SqlScope = {}, keepRemote?: (endpoint: string) => boolean): Executor {
  return sqlExecutor({
    d: SQLITE_DIALECT,
    run: sqliteRunner(store.db),
    scope,
    retentionMs: store.maxAgeMs,
    loadTrace: (id) => getStoredTrace(store.db, id, keepRemote) ?? null,
  });
}

/** Traces in the scope still waiting for their stats, for `pageContext(..., settling)`. Null when none. */
export function hubSettling(store: HubStore, scope: SqlScope = {}): number | null {
  return settlingCount(store.db, scope) || null;
}
