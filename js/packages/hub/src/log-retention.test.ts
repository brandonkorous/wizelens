import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { buildTrace, isLooseTraceId, type Trace } from "@wizeworks/lens-core";
import { SCENARIO_NOW, scenarioTraces } from "../../core/src/testing/scenario.js";
import { hubExecutor } from "./scale-exec.js";
import { HubStore } from "./store.js";
import { DAY, parity, RETENTION_MS, settleAll, writeTraces } from "./test/scale.js";

const traces = scenarioTraces();
const count = (db: DatabaseSync, sql: string, ...args: number[]) => (db.prepare(sql).get(...args) as { n: number }).n;

function storeWith(maxAgeMs: number, logsMaxAgeMs: number) {
  const clock = { now: SCENARIO_NOW };
  const store = new HubStore({ path: ":memory:", now: () => clock.now, maxAgeMs, logsMaxAgeMs });
  writeTraces(store, traces);
  settleAll(store, clock);
  store.prune();
  return { store, cutoff: clock.now };
}

/** What a store keeps when log lines go after `logAge` and traces after `traceAge`. */
function kept(now: number, traceAge: number, logAge: number): Trace[] {
  return traces.flatMap((t) => {
    if (isLooseTraceId(t.traceId)) return t.startMs < now - logAge ? [] : [t];
    if (t.startMs < now - traceAge) return [];
    return [buildTrace(t.traceId, t.spans, t.logs.filter((l) => l.timeMs >= now - logAge), t.remotes)];
  });
}

describe("log retention", () => {
  it("drops log lines before traces when logs are kept for less time", async () => {
    const { store, cutoff } = storeWith(RETENTION_MS, 4 * DAY);
    const before = cutoff - 4 * DAY;
    expect(count(store.db, "SELECT count(*) AS n FROM logs WHERE time_ms < ?", before)).toBe(0);
    expect(count(store.db, "SELECT count(*) AS n FROM fact_logs WHERE time_ms < ?", before)).toBe(0);
    expect(count(store.db, "SELECT count(*) AS n FROM fact_search WHERE kind = 'logs' AND time_ms < ?", before)).toBe(0);
    expect(count(store.db, "SELECT count(*) AS n FROM rollup_1h WHERE kind LIKE 'log%' AND bucket_ms < ?", before - 3_600_000)).toBe(0);
    expect(count(store.db, "SELECT count(*) AS n FROM fact_traces WHERE start_ms < ?", before)).toBeGreaterThan(0);
    expect(await parity(hubExecutor(store), kept(cutoff, RETENTION_MS, 4 * DAY), ["24h", "7d", "30d"], new Set(["firstMs", "lastMs", "top", "topRank", "ids"]))).toEqual([]);
  });

  it("keeps lines outside a request longer than traces when logs are kept for more time", () => {
    const { store, cutoff } = storeWith(4 * DAY, RETENTION_MS);
    const before = cutoff - 4 * DAY;
    expect(count(store.db, "SELECT count(*) AS n FROM traces WHERE start_ms < ? AND substr(trace_id, 1, 16) <> '0000000000000000'", before)).toBe(0);
    expect(count(store.db, "SELECT count(*) AS n FROM fact_logs WHERE time_ms < ? AND substr(trace_id, 1, 16) = '0000000000000000'", before)).toBeGreaterThan(0);
    expect(count(store.db, "SELECT count(*) AS n FROM rollup_1h WHERE kind = 'log' AND bucket_ms < ?", before)).toBeGreaterThan(0);
  });
});
