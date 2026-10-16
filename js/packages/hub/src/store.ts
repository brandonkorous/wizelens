import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ATTR_BROWSER_SESSION, type HubLog, type HubRemote, type HubSender, logKey, type Span } from "@wizeworks/lens-core";
import { HUB_SCHEMA, HUB_SCHEMA_VERSION, type HubStatements, prepareHubStatements } from "./schema.js";

export interface HubStoreOptions {
  /** SQLite file, or ":memory:". */
  path: string;
  /** Most traces kept. Default 50000. */
  maxTraces?: number;
  /** Oldest trace kept, in ms. Default 7 days. */
  maxAgeMs?: number;
  now?: () => number;
}

/** What one write holds. Spans and logs are already checked and redacted. */
export interface HubWrite {
  sender: HubSender;
  via: "addon" | "otlp";
  spans: readonly Span[];
  logs: readonly HubLog[];
  remotes: readonly HubRemote[];
}

const DAY_MS = 24 * 60 * 60_000;
const hashKey = (text: string) => createHash("sha1").update(text).digest("hex");
const sessionOf = (s: Span) => {
  const v = s.attributes[ATTR_BROWSER_SESSION];
  return typeof v === "string" && v ? v : null;
};

/** The hub's SQLite file. Writes come from ingest; reads build traces on demand (see store-read.ts). */
export class HubStore {
  readonly db: DatabaseSync;
  readonly maxTraces: number;
  readonly maxAgeMs: number;
  readonly path: string;
  readonly now: () => number;
  readonly #stmts: HubStatements;

  constructor(o: HubStoreOptions) {
    this.path = o.path;
    this.maxTraces = Math.max(1, o.maxTraces ?? 50_000);
    this.maxAgeMs = Math.max(60_000, o.maxAgeMs ?? 7 * DAY_MS);
    this.now = o.now ?? Date.now;
    if (o.path !== ":memory:") mkdirSync(dirname(o.path), { recursive: true });
    this.db = new DatabaseSync(o.path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
    this.db.exec(HUB_SCHEMA);
    this.db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema', ?)").run(HUB_SCHEMA_VERSION);
    this.#stmts = prepareHubStatements(this.db);
  }

  /** Save one batch in one transaction. */
  write(w: HubWrite): void {
    this.db.exec("BEGIN");
    try {
      this.#writeAll(w);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  #writeAll(w: HubWrite): void {
    const now = this.now();
    const env = w.sender.environment ?? "";
    const project = w.sender.project ?? "";
    const st = this.#stmts;
    this.#touchService(w.sender, w.via, now);
    for (const s of w.spans) {
      st.upsertTrace.run(s.traceId, s.startMs, s.startMs + s.durationMs, now, env, project);
      st.upsertSpan.run(s.traceId, s.spanId, s.service, s.startMs, s.durationMs, sessionOf(s), JSON.stringify(s));
    }
    for (const { traceId, log } of w.logs) {
      st.upsertTrace.run(traceId, log.timeMs, log.timeMs, now, env, project);
      st.insertLog.run(traceId, hashKey(logKey(log)), log.timeMs, JSON.stringify(log));
    }
    for (const r of w.remotes) st.insertRemote.run(r.traceId, r.endpoint);
  }

  #touchService(sender: HubSender, via: string, now: number): void {
    const s = sender;
    this.#stmts.upsertService.run(s.project ?? "", s.service, s.environment ?? "", s.host ?? "", via, JSON.stringify(sender), now, now);
  }

  /** Drop traces past the age or count limit, and services not seen for as long. Returns traces dropped. */
  prune(): number {
    const cutoff = this.now() - this.maxAgeMs;
    const doomed = this.db
      .prepare(
        `SELECT trace_id FROM traces WHERE start_ms < ?
         UNION SELECT trace_id FROM (SELECT trace_id FROM traces ORDER BY start_ms DESC LIMIT -1 OFFSET ?)`,
      )
      .all(cutoff, this.maxTraces) as { trace_id: string }[];
    this.db.exec("BEGIN");
    for (const table of ["traces", "spans", "logs", "remotes"]) {
      const del = this.db.prepare(`DELETE FROM ${table} WHERE trace_id = ?`);
      for (const r of doomed) del.run(r.trace_id);
    }
    this.db.prepare("DELETE FROM services WHERE last_seen < ?").run(cutoff);
    this.db.exec("COMMIT");
    return doomed.length;
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      // already closed
    }
  }
}
