import { patchMethod } from "../adapters/registry.js";
import { instrumentBetterSqlite3, instrumentNodeSqlite } from "../adapters/sqlite.js";
import type { WizeLens } from "../types.js";
import { autoHandle } from "./handle.js";
import { onBuiltin, onLoad } from "./module-hooks.js";

type Instrument = (wizelens: WizeLens, db: unknown) => boolean;
const seen = new WeakSet<object>();

// The SQLite adapter needs a database: it reads the statement class from one. So each database is instrumented on its first call.
function patchDatabase(Database: unknown, instrument: Instrument): void {
  const proto = (Database as { prototype?: object } | null)?.prototype;
  if (!proto) return;
  for (const name of ["prepare", "exec"]) {
    patchMethod(proto, name, (original) =>
      function (this: Record<string, (...a: unknown[]) => unknown>, ...args: unknown[]) {
        if (seen.has(this)) return original.apply(this, args);
        seen.add(this);
        try {
          instrument(autoHandle, this);
        } catch {
          return original.apply(this, args);
        }
        return this[name]!(...args);
      }, "auto-sqlite");
  }
}

/** better-sqlite3 and the built-in node:sqlite. */
export function hookSqlite(): void {
  onLoad(/\/node_modules\/better-sqlite3\/lib\/index\.js$/, (Database) => void patchDatabase(Database, instrumentBetterSqlite3));
  onBuiltin("sqlite", (sqlite) => void patchDatabase((sqlite as { DatabaseSync?: unknown }).DatabaseSync, instrumentNodeSqlite));
}
