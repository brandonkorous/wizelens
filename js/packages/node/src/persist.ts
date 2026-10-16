import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { ATTR_BROWSER_SESSION, type LogRecord, type Span } from "@wizeworks/lens-core";
import { prepareStatements, SCHEMA, SCHEMA_VERSION, type Statements } from "./persist-schema.js";
import { hookProcessExit, parseArray } from "./persist-util.js";
import type { StoredTrace, TraceStore } from "./store.js";

const require = createRequire(import.meta.url);

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

/** Writes the store to a SQLite file and loads it back on startup; any error turns it off with one warning. */
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
      this.#stmts = prepareStatements(db);
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
