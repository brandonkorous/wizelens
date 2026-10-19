import { afterAll, describe, expect, it } from "vitest";
import { pageParity } from "../../core/src/testing/scale-pages.js";
import { SCENARIO_NOW, scenarioTraces } from "../../core/src/testing/scenario.js";
import { SettlePool } from "./telemetry/ch/settle-pool.js";
import { CH_URL, type ChTest, chTest, chWrite } from "./test/ch.js";
import { RANGES } from "./test/scale.js";
import { TS_WORKER } from "./test/workers.js";

const task = { project: "p", items: [], now: 0, retentionMs: 0, ver: 1 };

describe("Settle worker pool", () => {
  it("fails the task of a worker that dies, and starts a new worker", async () => {
    const pool = new SettlePool({ url: "http://127.0.0.1:1/x", size: 1, entry: new URL("./test/crash-worker.mjs", import.meta.url) });
    try {
      await expect(pool.run(task)).rejects.toThrow(/exit code 3/);
      await expect(pool.run(task)).rejects.toThrow(/exit code 3/);
      expect(pool.size).toBe(1);
    } finally {
      await pool.close();
    }
    await expect(pool.run(task)).rejects.toThrow(/closed/);
  });
});

const opened: ChTest[] = [];
afterAll(async () => {
  for (const t of opened) await t.store.close();
  await Promise.all(opened.map((t) => t.drop()));
});

describe.skipIf(!CH_URL)("ClickHouse settle in worker threads", () => {
  it("settles small overlapping batches to the same pages", async () => {
    const traces = scenarioTraces();
    const t = await chTest(1000, undefined, { settleWorkers: 2, worker: TS_WORKER });
    opened.push(t);
    await chWrite(t, traces);
    expect(await t.store.settle(SCENARIO_NOW + 10_000, { batch: 7, budgetMs: Number.POSITIVE_INFINITY })).toBe(traces.length);
    expect(await t.store.settling(t.projectId)).toBeNull();
    // Workers write in any order, so between equally slow calls either trace may be the example (or a query's slowest); ch-scale checks it in order.
    const diffs = await pageParity(t.store.executor(t.projectId, t.retentionMs), traces, RANGES, t.retentionMs);
    expect(diffs.filter((d) => !d.includes(".exampleTraceId:") && !d.includes(".slowest.traceId:"))).toEqual([]);
  }, 180_000);
});
