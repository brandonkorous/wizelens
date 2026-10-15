import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { ATTR_BROWSER_SESSION, type LogRecord, type Span } from "@wizeworks/lens-core";
import type { StoredTrace, TraceStore } from "./store.js";

const require = createRequire(import.meta.url);

// Shared schema (docs/CONTRACT.md, "Storage"). The phase 2 hub reads these files too.
const SCHEMA_VERSION = "1";
const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta   (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS traces (
  trace_id TEXT PRIMARY KEY, start_ms REAL NOT NULL, updated_ms REAL NOT NULL,
  remotes TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS spans  (
  trace_id TEXT NOT NULL, span_id TEXT NOT NULL, parent_span_id TEXT,
  name TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL, service TEXT NOT NULL,
  start_ms REAL NOT NULL, duration_ms REAL NOT NULL, status TEXT NOT NULL,
  session TEXT,
  json TEXT NOT NULL,
  PRIMARY KEY (trace_id, span_id)
);
CREATE TABLE IF NOT EXISTS logs   (
  trace_id TEXT NOT NULL, seq INTEGER NOT NULL, time_ms REAL NOT NULL, level TEXT NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (trace_id, seq)
);
CREATE INDEX IF NOT EXISTS ix_traces_start  ON traces(start_ms);
CREATE INDEX IF NOT EXISTS ix_spans_session ON spans(session) WHERE session IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_spans_cat_dur ON spans(category, duration_ms);
`;

export interface PersisterOptions {
  path: string;
  serviceName: string;
  /** Flush interval in ms. Default 500. */
  intervalMs?: number;
  /** Called once when the file cannot be used. WizeLens then keeps working in memory. */
  warn?: (message: string) => void;
  /** Clock, for tests. */
  now?: () => number;
}

interface Statements {
  upsertTrace: StatementSync;
  upsertSpan: StatementSync;
  insertLog: StatementSync;
  pruneAge: StatementSync;
  pruneCount: StatementSync;
  pruneSpans: StatementSync;
  pruneLogs: StatementSync;
}

/**
 * Writes the in-memory store to a SQLite file and loads it back on startup.
 * The store stays the read path. Any error turns persistence off with one warning.
 */
export class SqlitePersister {
  readonly path: string;
  readonly #store: TraceStore;
  readonly #options: PersisterOptions;
  readonly #now: () => number;
  #db: DatabaseSync | undefined;
  #stmts: Statements | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #failed = false;
  #unhook: (() => void) | undefined;

  constructor(store: TraceStore, options: PersisterOptions) {
    this.#store = store;
    this.#options = options;
    this.path = options.path;
    this.#now = options.now ?? Date.now;
  }

  get active(): boolean {
    return this.#db !== undefined && !this.#failed;
  }

  /** Open the file, prune it, and load recent traces into the store. Returns false on failure. */
  open(): boolean {
    try {
      // Loaded lazily so `storage: "memory"` never touches node:sqlite.
      const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
      mkdirSync(dirname(this.path), { recursive: true });
      const db = new DatabaseSync(this.path);
      this.#db = db;
      db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 2000;");
      db.exec(SCHEMA);
      const setMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
      setMeta.run("schema", SCHEMA_VERSION);
      setMeta.run("service", this.#options.serviceName);
      this.#stmts = {
        upsertTrace: db.prepare(`INSERT INTO traces (trace_id, start_ms, updated_ms, remotes) VALUES (?, ?, ?, ?)
          ON CONFLICT(trace_id) DO UPDATE SET start_ms = min(start_ms, excluded.start_ms),
            updated_ms = excluded.updated_ms, remotes = excluded.remotes`),
        upsertSpan: db.prepare(`INSERT OR REPLACE INTO spans
          (trace_id, span_id, parent_span_id, name, kind, category, service, start_ms, duration_ms, status, session, json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
        insertLog: db.prepare("INSERT OR IGNORE INTO logs (trace_id, seq, time_ms, level, json) VALUES (?, ?, ?, ?, ?)"),
        pruneAge: db.prepare("DELETE FROM traces WHERE start_ms < ?"),
        pruneCount: db.prepare(
          "DELETE FROM traces WHERE trace_id NOT IN (SELECT trace_id FROM traces ORDER BY start_ms DESC LIMIT ?)",
        ),
        pruneSpans: db.prepare("DELETE FROM spans WHERE trace_id NOT IN (SELECT trace_id FROM traces)"),
        pruneLogs: db.prepare("DELETE FROM logs WHERE trace_id NOT IN (SELECT trace_id FROM traces)"),
      };
      this.#prune();
      this.#store.load(this.#loadRecent());
      return true;
    } catch (err) {
      this.#fail(err);
      return false;
    }
  }

  /** Flush every `intervalMs`, and once more when the process exits. */
  start(): void {
    if (!this.active || this.#timer) return;
    this.#timer = setInterval(() => this.flush(), this.#options.intervalMs ?? 500);
    this.#timer.unref();
    this.#unhook = hookProcessExit(() => this.flush());
  }

  /** Write all changed traces in one transaction, then prune. Synchronous on purpose (safe in `exit`). */
  flush(): void {
    const db = this.#db;
    const stmts = this.#stmts;
    if (!db || !stmts || this.#failed) return;
    const changes = this.#store.drainChanges();
    if (changes.length === 0) return;
    const now = this.#now();
    try {
      db.exec("BEGIN");
      for (const c of changes) {
        stmts.upsertTrace.run(c.traceId, c.startMs, now, JSON.stringify(c.remotes));
        for (const s of c.spans) {
          const session = s.attributes[ATTR_BROWSER_SESSION];
          stmts.upsertSpan.run(
            s.traceId,
            s.spanId,
            s.parentSpanId,
            s.name,
            s.kind,
            s.category,
            s.service,
            s.startMs,
            s.durationMs,
            s.status,
            typeof session === "string" && session ? session : null,
            JSON.stringify(s),
          );
        }
        for (const { seq, log } of c.logs) stmts.insertLog.run(c.traceId, seq, log.timeMs, log.level, JSON.stringify(log));
      }
      this.#prune();
      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // already rolled back
      }
      this.#fail(err);
    }
  }

  /** Final flush, then close the file. */
  close(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    this.#unhook?.();
    this.#unhook = undefined;
    this.flush();
    try {
      this.#db?.close();
    } catch {
      // closing is best effort
    }
    this.#db = undefined;
  }

  #prune(): void {
    const stmts = this.#stmts!;
    stmts.pruneAge.run(this.#now() - this.#store.maxAgeMs);
    stmts.pruneCount.run(this.#store.maxTraces);
    stmts.pruneSpans.run();
    stmts.pruneLogs.run();
  }

  #loadRecent(): StoredTrace[] {
    const db = this.#db!;
    const rows = db
      .prepare("SELECT trace_id, start_ms, remotes FROM traces ORDER BY start_ms DESC LIMIT ?")
      .all(this.#store.maxTraces) as { trace_id: string; start_ms: number; remotes: string }[];
    const spansOf = db.prepare("SELECT json FROM spans WHERE trace_id = ?");
    const logsOf = db.prepare("SELECT json FROM logs WHERE trace_id = ? ORDER BY seq");
    // Oldest first, so the ring buffer evicts in the right order.
    return rows.reverse().map((r) => ({
      traceId: r.trace_id,
      startMs: r.start_ms,
      remotes: parseArray<string>(r.remotes),
      spans: (spansOf.all(r.trace_id) as { json: string }[]).map((x) => JSON.parse(x.json) as Span),
      logs: (logsOf.all(r.trace_id) as { json: string }[]).map((x) => JSON.parse(x.json) as LogRecord),
    }));
  }

  #fail(err: unknown): void {
    if (this.#failed) return;
    this.#failed = true;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    this.#unhook?.();
    this.#unhook = undefined;
    try {
      this.#db?.close();
    } catch {
      // ignore
    }
    this.#db = undefined;
    const message = err instanceof Error ? err.message : String(err);
    (this.#options.warn ?? console.warn)(
      `[wizelens] Could not use the trace file ${this.path} (${message}). Traces are kept in memory only.`,
    );
  }
}

function parseArray<T>(json: string): T[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Run `flush` when the process ends. `exit` covers normal exit and process.exit().
 * For SIGINT/SIGTERM we flush, and if no one else listens we re-raise the signal so the
 * default behavior (exit) still happens. Other listeners keep full control otherwise.
 */
function hookProcessExit(flush: () => void): () => void {
  const onExit = () => flush();
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  const onSignal = (signal: NodeJS.Signals) => {
    flush();
    if (process.listenerCount(signal) === 1) {
      process.removeListener(signal, onSignal);
      process.kill(process.pid, signal);
    }
  };
  process.on("exit", onExit);
  for (const s of signals) process.on(s, onSignal);
  return () => {
    process.removeListener("exit", onExit);
    for (const s of signals) process.removeListener(s, onSignal);
  };
}
