import { afterAll, describe, expect, it } from "vitest";
import { pageContext, runPage, type Trace } from "@wizeworks/lens-core";
import { ANOMALY_NOW, anomalyTraces } from "../../core/src/testing/anomaly-scenario.js";
import { problemsParity } from "../../core/src/testing/scale-pages.js";
import { CH_LIMIT, CH_URL, type ChTest, chTest } from "./test/ch.js";
import { type ScaleDb, scaleDb, settleAll, writeChunked } from "./test/scale.js";

const traces = anomalyTraces();
const RANGES = ["1h", "6h", "24h"] as const;

describe("Problems page on Postgres", () => {
  let s: ScaleDb;
  afterAll(() => s?.db.close());

  it("finds the spike's problem like the memory executor", async () => {
    s = await scaleDb();
    await writeChunked(s.db, s.projectId, traces, ANOMALY_NOW);
    await settleAll(s, ANOMALY_NOW + 10_000);
    expect(await problemsParity(s.ex, traces, ANOMALY_NOW, RANGES, s.retentionMs)).toEqual([]);
    const m = await runPage("problems", pageContext("1h", ANOMALY_NOW, {}), s.ex);
    expect(m.problems.map((p) => p.cause?.kind)).toEqual(["release"]);
  }, 120_000);
});

/** Write through the ClickHouse store in batches of 100 traces. */
async function chWriteChunked(t: ChTest, list: readonly Trace[]): Promise<void> {
  for (let i = 0; i < list.length; i += 100) {
    const part = list.slice(i, i + 100);
    const w = { sender: { service: "api", environment: "prod" }, via: "addon" as const, spans: part.flatMap((x) => x.spans), logs: [], remotes: [] };
    await t.store.write(t.projectId, w, ANOMALY_NOW);
  }
}

describe.skipIf(!CH_URL)("Problems page on ClickHouse", () => {
  let t: ChTest;
  afterAll(async () => t && (await t.drop()));

  it("finds the spike's problem like the memory executor", async () => {
    t = await chTest(1000, ANOMALY_NOW);
    await chWriteChunked(t, traces);
    await t.store.settle(ANOMALY_NOW + 10_000, { budgetMs: Number.POSITIVE_INFINITY });
    const ex = t.store.executor(t.projectId, t.retentionMs);
    expect(await problemsParity(ex, traces, ANOMALY_NOW, RANGES, t.retentionMs)).toEqual([]);
    const m = await runPage("problems", pageContext("1h", ANOMALY_NOW, {}), ex);
    expect(m.problems.map((p) => p.cause?.kind)).toEqual(["release"]);
  }, CH_LIMIT);
});
