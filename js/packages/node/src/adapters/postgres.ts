import type { DbSpan, StartDbSpan } from "../db.js";
import type { WizeLens } from "../types.js";
import { dbSpansOf, patchMethod } from "./registry.js";

/** The parts of a postgres.js query this adapter reads. Queries are lazy: they run on the first await. */
interface PgJsQuery {
  tagged?: boolean;
  strings?: readonly string[];
  args?: unknown[];
  executed?: boolean;
  /** The final SQL, set when a connection builds the query. */
  string?: string;
  parameters?: unknown[];
  resolve?: (value: unknown) => unknown;
  reject?: (err: unknown) => unknown;
}

type Method = (...args: unknown[]) => unknown;

/** Set on a query by a library on top of postgres.js (Drizzle): its span carries that name as the adapter. */
const LABEL = Symbol.for("wizeworks.wizelens.postgres-label");

/** The query text before it runs. Tagged-template values become $1, $2, … as postgres.js numbers them. */
function textOf(q: PgJsQuery): string {
  const strings = q.strings ?? [];
  if (!q.tagged || strings.length === 0) return strings[0] ?? "";
  return strings.reduce((text, part, i) => `${text}$${i}${part}`);
}

/** Rows of a postgres.js result: its count, or the rows it holds. */
function pgJsRows(result: unknown): number | undefined {
  const r = result as { count?: unknown } | null;
  if (typeof r?.count === "number") return r.count;
  return Array.isArray(result) ? result.length : undefined;
}

/** End the span when the query settles. A cursor swaps in its own resolve and reject later, so both stay wrapped. */
function settleThrough(q: PgJsQuery, span: DbSpan): void {
  let open = true;
  const finish = (ok: boolean, value: unknown) => {
    if (!open) return;
    open = false;
    if (q.string && q.string !== textOf(q)) span.retext(q.string, q.parameters ?? q.args);
    if (ok) span.end(value);
    else span.fail(value);
  };
  for (const key of ["resolve", "reject"] as const) {
    let current = q[key];
    Object.defineProperty(q, key, {
      configurable: true,
      enumerable: true,
      get: () => (value: unknown) => (finish(key === "resolve", value), current?.(value)),
      set: (fn: PgJsQuery[typeof key]) => void (current = fn),
    });
  }
}

function openSpan(start: StartDbSpan, q: PgJsQuery): void {
  const label = (q as Record<symbol, unknown>)[LABEL];
  const adapter = typeof label === "string" ? label : "postgres";
  const span = start({ system: "postgresql", adapter, rowsOf: pgJsRows, requireParent: true }, textOf(q), q.args);
  if (span) settleThrough(q, span);
}

/** Query.prototype, from a postgres.js `sql` (or a transaction's), the Query class, or an object holding it. */
function queryPrototype(target: unknown): object | null {
  const t = target as { unsafe?: unknown; Query?: { prototype?: unknown }; prototype?: unknown } | null;
  let proto: unknown = t?.Query?.prototype;
  if (!proto && typeof t?.unsafe === "function") {
    const probe = (t.unsafe as Method)("SELECT 1");
    proto = probe && typeof probe === "object" ? Object.getPrototypeOf(probe) : null;
  }
  if (!proto && typeof target === "function") proto = t?.prototype;
  return proto && typeof (proto as { handle?: unknown }).handle === "function" ? (proto as object) : null;
}

/** Trace every postgres.js (`postgres` package) query. Pass a `sql` instance, or the Query class. Returns false when nothing was patched. */
export function instrumentPostgresJs(wizelens: WizeLens, target: unknown): boolean {
  const start = dbSpansOf(wizelens);
  const proto = start && queryPrototype(target);
  if (!start || !proto) return false;
  patchMethod(proto, "handle", (original) =>
    function (this: PgJsQuery, ...args: unknown[]) {
      if (!this.executed) openSpan(start, this);
      return original.apply(this, args);
    },
  );
  return true;
}

/** Wrap the trailing callback so the transaction's own `sql` is labeled too. */
function labelScope(label: string): (original: Method) => Method {
  return (original) =>
    function (this: unknown, ...args: unknown[]) {
      const i = args.length - 1;
      const fn = args[i];
      if (typeof fn !== "function") return original.apply(this, args);
      const scoped = (tx: unknown) => (tx && labelPostgresJs(tx as object, label), (fn as Method)(tx));
      return original.apply(this, [...args.slice(0, i), scoped]);
    };
}

/** Make the queries of one postgres.js `sql`, its transactions, and their savepoints carry `label` as the adapter. */
export function labelPostgresJs(sql: object, label: string): void {
  patchMethod(sql, "unsafe", (original) =>
    function (this: unknown, ...args: unknown[]) {
      const q = original.apply(this, args);
      if (q && typeof q === "object") (q as Record<symbol, unknown>)[LABEL] = label;
      return q;
    },
    "labeled",
  );
  patchMethod(sql, "begin", labelScope(label), "labeled");
  patchMethod(sql, "savepoint", labelScope(label), "labeled");
}

/** True for a postgres.js `sql` function: callable, with `unsafe` and `begin`. */
export function isPostgresJs(client: unknown): boolean {
  const c = client as { unsafe?: unknown; begin?: unknown } | null;
  return typeof client === "function" && typeof c?.unsafe === "function" && typeof c?.begin === "function";
}
