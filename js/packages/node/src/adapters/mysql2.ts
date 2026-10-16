import { runTraced, withAdapterLabel } from "../db.js";
import type { WizeLens } from "../types.js";
import { dbSpansOf, patchMethod } from "./registry.js";

interface MysqlConnectionLike {
  config?: { database?: string; connectionConfig?: { database?: string } };
}

/** Rows of a mysql2 result: the row list, or affectedRows for writes. */
function mysqlRows(result: unknown): number | undefined {
  if (Array.isArray(result)) return result.length;
  const r = result as { affectedRows?: number } | null;
  return r?.affectedRows;
}

function queryOf(args: unknown[]): { sql: string; values: unknown } | null {
  const first = args[0];
  const second = typeof args[1] === "function" ? undefined : args[1];
  if (typeof first === "string") return { sql: first, values: second };
  const options = first as { sql?: unknown; values?: unknown } | null;
  return typeof options?.sql === "string" ? { sql: options.sql, values: options.values ?? second } : null;
}

type MysqlTarget = { Connection?: { prototype?: object }; Pool?: { prototype?: object }; connection?: object; pool?: object; query?: unknown; config?: unknown } | null;

/** Prototypes to patch: Connection and Pool from the module, or the class of a core connection or pool (promise wrappers unwrapped). */
function prototypesOf(target: unknown): object[] {
  const t = target as MysqlTarget;
  if (t?.Connection?.prototype) return [t.Connection.prototype, t.Pool?.prototype].filter((p): p is object => !!p);
  if (t?.connection) return prototypesOf(t.connection);
  if (t?.pool && typeof t.pool === "object" && !t.config) return prototypesOf(t.pool);
  if (t && typeof t.query === "function" && t.config) return [Object.getPrototypeOf(t) as object];
  return [];
}

function traceMethod(proto: object, name: "query" | "execute", start: NonNullable<ReturnType<typeof dbSpansOf>>): void {
  patchMethod(proto, name, (original) =>
    function (this: MysqlConnectionLike, ...args: unknown[]) {
      const q = queryOf(args);
      if (!q || typeof args[args.length - 1] !== "function") return original.apply(this, args);
      const span = start({ system: "mysql", adapter: "mysql2", namespace: this.config?.database ?? this.config?.connectionConfig?.database, rowsOf: mysqlRows, requireParent: true }, q.sql, q.values);
      return runTraced(span, args, (a) => original.apply(this, a));
    },
  );
}

/** Trace every mysql2 query and execute. Pass the `mysql2` module (covers connections and pools), a connection, or a pool. Returns false when nothing was patched. */
export function instrumentMysql2(wizelens: WizeLens, target: unknown): boolean {
  const start = dbSpansOf(wizelens);
  const protos = prototypesOf(target);
  if (!start || protos.length === 0) return false;
  for (const proto of protos) {
    traceMethod(proto, "query", start);
    traceMethod(proto, "execute", start);
  }
  return true;
}

/** Wrap `query` and `execute` of one pool or connection so its driver spans carry `label` as the adapter. */
export function labelMysqlClient(client: object, label: string): void {
  for (const name of ["query", "execute"]) {
    patchMethod(client, name, (original) =>
      function (this: unknown, ...args: unknown[]) {
        return withAdapterLabel(label, () => original.apply(this, args));
      },
      "labeled",
    );
  }
}
