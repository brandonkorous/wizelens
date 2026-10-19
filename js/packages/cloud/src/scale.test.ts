import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pageParity } from "../../core/src/testing/scale-pages.js";
import { scenarioTraces } from "../../core/src/testing/scenario.js";
import { cloudExecutor, cloudSettling } from "./scale-exec.js";
import { parity, RANGES, type ScaleDb, scaleDb, settleAll, writeTraces } from "./test/scale.js";

const traces = scenarioTraces();
let s: ScaleDb;
let settleMs = 0;
beforeAll(async () => {
  s = await scaleDb();
  await writeTraces(s, traces);
  const t0 = performance.now();
  await settleAll(s);
  settleMs = performance.now() - t0;
});
afterAll(() => s.db.close());

describe("cloud stats tables", () => {
  it("settles the scenario", async () => {
    expect(await cloudSettling(s.db, s.projectId)).toBeNull();
    const [row] = await s.db.query<{ n: number }>("SELECT count(*)::int AS n FROM fact_traces WHERE project_id = $1", [s.projectId]);
    expect(row!.n).toBe(traces.length);
    expect(settleMs).toBeGreaterThan(0);
  });

  it("answers every need like the memory executor", async () => {
    expect(await parity(s, traces)).toEqual([]);
    expect(await parity({ ...s, ex: cloudExecutor(s.db, s.projectId, s.retentionMs, "prod") }, traces, ["24h"])).toEqual([]);
    expect(await parity({ ...s, ex: cloudExecutor(s.db, "other", s.retentionMs) }, traces, ["1h"])).not.toEqual([]);
  });

  // Every page, range, and filter on PGlite: slow on a busy CI runner.
  it("computes every page like the memory executor", async () => {
    expect(await pageParity(s.ex, traces, RANGES, s.retentionMs)).toEqual([]);
  }, 120_000);
});
