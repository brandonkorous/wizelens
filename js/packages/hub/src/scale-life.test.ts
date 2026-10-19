import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { logKey, type Trace } from "@wizeworks/lens-core";
import { scenarioTraces } from "../../core/src/testing/scenario.js";
import { hubExecutor, hubSettling } from "./scale-exec.js";
import { clockStore, parity, settleAll, writeTraces } from "./test/scale.js";

const traces = scenarioTraces();
const dir = mkdtempSync(join(tmpdir(), "wizelens-scale-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const count = (db: DatabaseSync, table: string) => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
// Display fields (first time, tops, ids) are never subtracted, so they may still show traces that left.
const DISPLAY = new Set(["firstMs", "lastMs", "top", "topRank", "ids"]);

// The hub file as schema version 2 shipped it.
const V2_SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS traces (
  trace_id TEXT PRIMARY KEY, start_ms REAL NOT NULL, end_ms REAL NOT NULL, updated_ms REAL NOT NULL,
  env TEXT NOT NULL DEFAULT '', project TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS spans (
  trace_id TEXT NOT NULL, span_id TEXT NOT NULL, service TEXT NOT NULL, start_ms REAL NOT NULL,
  duration_ms REAL NOT NULL, session TEXT, json TEXT NOT NULL, PRIMARY KEY (trace_id, span_id)
);
CREATE TABLE IF NOT EXISTS logs (
  trace_id TEXT NOT NULL, key TEXT NOT NULL, time_ms REAL NOT NULL, json TEXT NOT NULL, PRIMARY KEY (trace_id, key)
);
CREATE TABLE IF NOT EXISTS remotes (trace_id TEXT NOT NULL, endpoint TEXT NOT NULL, PRIMARY KEY (trace_id, endpoint));
CREATE TABLE IF NOT EXISTS services (
  project TEXT NOT NULL, service TEXT NOT NULL, environment TEXT NOT NULL, host TEXT NOT NULL, via TEXT NOT NULL, info TEXT NOT NULL,
  first_seen REAL NOT NULL, last_seen REAL NOT NULL, PRIMARY KEY (project, service, environment, host)
);
CREATE TABLE IF NOT EXISTS metrics (
  time_ms REAL NOT NULL, project TEXT NOT NULL DEFAULT '', env TEXT NOT NULL DEFAULT '', service TEXT NOT NULL,
  name TEXT NOT NULL, series_key TEXT NOT NULL, json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_traces_start ON traces(start_ms);
INSERT INTO meta (key, value) VALUES ('schema', '2');
`;

function writeV2(path: string, list: readonly Trace[], updatedMs: number): void {
  const db = new DatabaseSync(path);
  db.exec(V2_SCHEMA);
  const trace = db.prepare("INSERT INTO traces (trace_id, start_ms, end_ms, updated_ms, env, project) VALUES (?, ?, ?, ?, 'prod', 'shop')");
  const span = db.prepare("INSERT INTO spans (trace_id, span_id, service, start_ms, duration_ms, session, json) VALUES (?, ?, ?, ?, ?, NULL, ?)");
  const log = db.prepare("INSERT OR IGNORE INTO logs (trace_id, key, time_ms, json) VALUES (?, ?, ?, ?)");
  // One transaction: a commit per row is slow on a slow disk (the Windows CI runner took 40 s).
  db.exec("BEGIN");
  for (const t of list) {
    trace.run(t.traceId, t.startMs, t.startMs + t.durationMs, updatedMs);
    for (const s of t.spans) span.run(t.traceId, s.spanId, s.service, s.startMs, s.durationMs, JSON.stringify(s));
    for (const l of t.logs) log.run(t.traceId, createHash("sha1").update(logKey(l)).digest("hex"), l.timeMs, JSON.stringify(l));
  }
  db.exec("COMMIT");
  db.close();
}

describe("hub stats over time", () => {
  it("settles a late span to the same stats as a fresh build", async () => {
    const late = traces.find((t) => t.spans.length > 4)!;
    const { store, clock } = clockStore();
    writeTraces(store, traces.filter((t) => t !== late));
    store.write({ sender: { service: "api", environment: "prod", project: "shop" }, via: "addon", spans: late.spans.slice(0, -2), logs: [], remotes: [] });
    settleAll(store, clock);
    writeTraces(store, [late]);
    expect(hubSettling(store, {}, 0)).toBe(1);
    expect(settleAll(store, clock)).toBe(1);
    expect(await parity(hubExecutor(store), traces)).toEqual([]);
  });

  it("takes pruned traces out of the rollups", async () => {
    const { store, clock } = clockStore(":memory:", { maxTraces: 150 });
    writeTraces(store, traces);
    settleAll(store, clock);
    const gen = store.settleGen;
    expect(store.prune()).toBe(60);
    expect(store.settleGen).toBe(gen + 1);
    expect(count(store.db, "fact_traces")).toBe(150);
    expect(await parity(hubExecutor(store), traces.slice(0, 150), undefined, DISPLAY)).toEqual([]);
  });

  it("upgrades a version 2 file and backfills its stats", async () => {
    const path = join(dir, "v2.db");
    writeV2(path, traces, 1);
    const { store, clock } = clockStore(path);
    expect(store.db.prepare("SELECT value FROM meta WHERE key = 'schema'").get()).toEqual({ value: "3" });
    expect(hubSettling(store, {}, 0)).toBe(traces.length);
    settleAll(store, clock);
    expect(await parity(hubExecutor(store), traces)).toEqual([]);
    store.close();
  });

  it("rebuilds the stats when the facts version changes", async () => {
    const path = join(dir, "bump.db");
    const first = clockStore(path);
    writeTraces(first.store, traces);
    settleAll(first.store, first.clock);
    first.store.db.exec("UPDATE meta SET value = '0' WHERE key = 'facts'");
    first.store.close();
    const { store, clock } = clockStore(path);
    expect([hubSettling(store, {}, 0), count(store.db, "rollup_1h"), count(store.db, "fact_requests")]).toEqual([traces.length, 0, 0]);
    settleAll(store, clock);
    expect(await parity(hubExecutor(store), traces)).toEqual([]);
    store.close();
  });
});
