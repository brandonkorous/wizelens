import { describe, expect, it } from "vitest";
import { buildTrace, isLooseTraceId, type Trace } from "@wizeworks/lens-core/internal";
import { SCENARIO_NOW, scenarioTraces } from "../../core/src/testing/scenario.js";
import { pruneLogsByRetention } from "./repo/log-retention.js";
import { pruneByRetention } from "./repo/trace-write.js";
import { pruneRollups } from "./settle.js";
import { DAY, parity, type ScaleDb, scaleDb, settleAll, writeTraces } from "./test/scale.js";

const traces = scenarioTraces();
const NOW = SCENARIO_NOW + 10_000;
const DISPLAY = new Set(["firstMs", "lastMs", "top", "topRank", "ids"]);
const count = async (s: ScaleDb, sql: string, ...args: unknown[]) => (await s.db.query<{ n: number }>(sql, args))[0]!.n;

async function pruned(traceDays: number, logDays: number): Promise<ScaleDb> {
  const s = await scaleDb(traceDays);
  await s.db.query("UPDATE projects SET log_retention_days = $1 WHERE id = $2", [logDays, s.projectId]);
  await writeTraces(s, traces);
  await settleAll(s);
  while ((await pruneByRetention(s.db, NOW)) > 0);
  await pruneLogsByRetention(s.db, NOW);
  await pruneRollups(s.db, NOW, true);
  return s;
}

/** What a project keeps when log lines go after `logAge` and traces after `traceAge`. */
function kept(traceAge: number, logAge: number): Trace[] {
  return traces.flatMap((t) => {
    if (isLooseTraceId(t.traceId)) return t.startMs < NOW - logAge ? [] : [t];
    if (t.startMs < NOW - traceAge) return [];
    return [buildTrace(t.traceId, t.spans, t.logs.filter((l) => l.timeMs >= NOW - logAge), t.remotes)];
  });
}

describe("log retention per project", () => {
  it("drops log lines before traces when logs are kept for less time", async () => {
    const s = await pruned(90, 4);
    const before = NOW - 4 * DAY;
    expect(await count(s, "SELECT count(*)::int AS n FROM logs WHERE time_ms < $1", before)).toBe(0);
    expect(await count(s, "SELECT count(*)::int AS n FROM fact_logs WHERE time_ms < $1", before)).toBe(0);
    expect(await count(s, "SELECT count(*)::int AS n FROM fact_traces WHERE start_ms < $1", before)).toBeGreaterThan(0);
    expect(await parity(s, kept(90 * DAY, 4 * DAY), ["24h", "7d", "30d"], DISPLAY)).toEqual([]);
    await s.db.close();
  });

  it("keeps lines outside a request longer than traces when logs are kept for more time", async () => {
    const s = await pruned(4, 90);
    const before = NOW - 4 * DAY;
    expect(await count(s, "SELECT count(*)::int AS n FROM traces WHERE start_ms < $1 AND substr(trace_id, 1, 16) <> '0000000000000000'", before)).toBe(0);
    expect(await count(s, "SELECT count(*)::int AS n FROM fact_logs WHERE time_ms < $1 AND substr(trace_id, 1, 16) = '0000000000000000'", before)).toBeGreaterThan(0);
    expect(await count(s, "SELECT count(*)::int AS n FROM rollup_1h WHERE kind = 'log' AND bucket_ms < $1", before)).toBeGreaterThan(0);
    await s.db.close();
  });
});
