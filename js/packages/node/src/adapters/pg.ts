import { runTraced, withAdapterLabel } from "../db.js";
import type { WizeLens } from "../types.js";
import { dbSpansOf, patchMethod } from "./registry.js";

interface PgQueryConfig {
  text?: string;
  values?: unknown[];
  submit?: unknown;
}

interface PgClientLike {
  database?: string;
  connectionParameters?: { database?: string };
}

/** Rows of a pg result: rowCount, rows, or the sum over a multi-statement result. */
function pgRows(result: unknown): number | undefined {
  if (Array.isArray(result)) return result.reduce((t: number, r) => t + (pgRows(r) ?? 0), 0);
  const r = result as { rowCount?: number | null; rows?: unknown[] } | null;
  return r?.rowCount ?? r?.rows?.length ?? undefined;
}

function queryOf(args: unknown[]): { sql: string; values: unknown } | null {
  const first = args[0];
  if (typeof first === "string") return { sql: first, values: Array.isArray(args[1]) ? args[1] : undefined };
  const config = first as PgQueryConfig | null;
  if (!config || typeof config.submit === "function" || typeof config.text !== "string") return null;
  return { sql: config.text, values: config.values ?? (Array.isArray(args[1]) ? args[1] : undefined) };
}

/** The Client prototype from the pg module, a Pool, or a Client. */
function clientPrototype(target: unknown): object | null {
  const t = target as { Client?: { prototype?: object }; query?: unknown; connectionParameters?: unknown } | null;
  if (t?.Client?.prototype) return t.Client.prototype;
  if (t && typeof t.query === "function" && t.connectionParameters) return Object.getPrototypeOf(t) as object;
  return null;
}

/** Trace every node-postgres (`pg`) query. Pass the `pg` module, a Pool, or a Client. Returns false when nothing was patched. */
export function instrumentPg(wizelens: WizeLens, target: unknown): boolean {
  const start = dbSpansOf(wizelens);
  const proto = clientPrototype(target);
  if (!start || !proto) return false;
  patchMethod(proto, "query", (original) =>
    function (this: PgClientLike, ...args: unknown[]) {
      const q = queryOf(args);
      if (!q) return original.apply(this, args);
      const namespace = this.database ?? this.connectionParameters?.database;
      const span = start({ system: "postgresql", adapter: "pg", namespace, rowsOf: pgRows, requireParent: true }, q.sql, q.values);
      return runTraced(span, args, (a) => original.apply(this, a));
    },
  );
  return true;
}

/** Wrap the `query` method of one pool or client so its driver spans carry `label` as the adapter. */
export function labelPgClient(client: object, label: string): void {
  patchMethod(client, "query", (original) =>
    function (this: unknown, ...args: unknown[]) {
      return withAdapterLabel(label, () => original.apply(this, args));
    },
    "labeled",
  );
}
