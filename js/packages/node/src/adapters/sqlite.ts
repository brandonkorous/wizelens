import { basename, extname } from "node:path";
import { runTraced } from "../db.js";
import type { WizeLens } from "../types.js";
import { dbSpansOf, patchMethod } from "./registry.js";

// One adapter for both SQLite drivers: better-sqlite3 and the built-in node:sqlite. Both share one Statement prototype per driver.

interface StatementLike {
  source?: string;
  sourceSQL?: string;
}

interface DatabaseLike {
  prepare(sql: string): object;
  name?: string;
  location?: () => string | null;
}

interface StatementTag {
  adapter: string;
  namespace: string | undefined;
}

const TAG = Symbol.for("wizeworks.wizelens.statement-tag");

const ROWS: Record<string, (result: unknown) => number | undefined> = {
  run: (r) => {
    const changes = (r as { changes?: number | bigint } | null)?.changes;
    return changes === undefined ? undefined : Number(changes);
  },
  get: (r) => (r === undefined ? 0 : 1),
  all: (r) => (Array.isArray(r) ? r.length : undefined),
};

const isDatabase = (t: unknown): t is DatabaseLike => typeof (t as DatabaseLike | null)?.prepare === "function";

/** The database file name without folder or extension ("orders"), or ":memory:". */
function databaseName(db: DatabaseLike): string | undefined {
  const file = typeof db.name === "string" ? db.name : typeof db.location === "function" ? (db.location() ?? ":memory:") : undefined;
  if (!file || file.startsWith(":")) return file;
  return basename(file, extname(file));
}

function traceStatements(proto: object, fallback: string, start: NonNullable<ReturnType<typeof dbSpansOf>>): void {
  for (const name of Object.keys(ROWS)) {
    patchMethod(proto, name, (original) =>
      function (this: StatementLike & Record<symbol, StatementTag | undefined>, ...args: unknown[]) {
        const tag = this[TAG];
        const info = { system: "sqlite", adapter: tag?.adapter ?? fallback, namespace: tag?.namespace, rowsOf: ROWS[name], requireParent: true };
        const span = start(info, this.source ?? this.sourceSQL ?? "", args.length ? args : undefined);
        return runTraced(span, [], () => original.apply(this, args));
      },
    );
  }
}

function traceExec(db: DatabaseLike, tag: StatementTag, start: NonNullable<ReturnType<typeof dbSpansOf>>): void {
  patchMethod(Object.getPrototypeOf(db) as object, "exec", (original) =>
    function (this: DatabaseLike, ...args: unknown[]) {
      const span = start({ system: "sqlite", adapter: tag.adapter, namespace: databaseName(this), requireParent: true }, String(args[0] ?? ""), undefined);
      return runTraced(span, [], () => original.apply(this, args));
    },
  );
}

/** Tag every statement this database prepares with its adapter and file. */
function tagStatements(db: DatabaseLike, tag: StatementTag): void {
  patchMethod(db, "prepare", (original) =>
    function (this: unknown, ...args: unknown[]) {
      const statement = original.apply(this, args) as Record<symbol, StatementTag>;
      statement[TAG] = tag;
      return statement;
    },
    "tagged",
  );
}

function instrumentSqlite(wizelens: WizeLens, db: unknown, driver: string, adapter: string | undefined): boolean {
  const start = dbSpansOf(wizelens);
  if (!start || !isDatabase(db)) return false;
  const tag = { adapter: adapter ?? driver, namespace: databaseName(db) };
  traceStatements(Object.getPrototypeOf(db.prepare("SELECT 1")) as object, driver, start);
  traceExec(db, tag, start);
  tagStatements(db, tag);
  return true;
}

/** Trace every better-sqlite3 statement (run, get, all) and exec. Pass a Database. */
export const instrumentBetterSqlite3 = (wizelens: WizeLens, db: unknown, options: { adapter?: string } = {}): boolean =>
  instrumentSqlite(wizelens, db, "better-sqlite3", options.adapter);

/** Trace every node:sqlite statement (run, get, all) and exec. Pass a DatabaseSync. */
export const instrumentNodeSqlite = (wizelens: WizeLens, db: unknown, options: { adapter?: string } = {}): boolean =>
  instrumentSqlite(wizelens, db, "node-sqlite", options.adapter);
