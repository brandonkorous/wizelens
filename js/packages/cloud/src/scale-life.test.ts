import { describe, expect, it } from "vitest";
import { SCENARIO_NOW, scenarioTraces } from "../../core/src/testing/scenario.js";
import { pruneByRetention } from "./repo/trace-write.js";
import { cloudSettling } from "./scale-exec.js";
import { checkFactsVersion, pruneRollups, settleCloud } from "./settle.js";
import { DAY, parity, scaleDb, settleAll, writeTraces } from "./test/scale.js";

const traces = scenarioTraces();
const count = async (s: { db: { query: <T>(sql: string) => Promise<T[]> } }, table: string) => (await s.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`))[0]!.n;

describe("cloud stats over time", () => {
  it("settles a late span to the same stats as a fresh build", async () => {
    const s = await scaleDb();
    const late = traces.find((t) => t.spans.length > 4)!;
    await writeTraces(s, traces.filter((t) => t !== late));
    await writeTraces(s, [{ ...late, spans: late.spans.slice(0, -2), logs: [] }]);
    await settleAll(s);
    await writeTraces(s, [late], SCENARIO_NOW + 20_000);
    expect(await cloudSettling(s.db, s.projectId)).toBe(1);
    expect(await cloudSettling(s.db, s.projectId, { before: SCENARIO_NOW + 20_000 })).toBe(1);
    expect(await cloudSettling(s.db, s.projectId, { before: SCENARIO_NOW + 19_999 })).toBeNull();
    expect(await cloudSettling(s.db, s.projectId, { env: "nope" })).toBeNull();
    expect(await settleCloud(s.db, SCENARIO_NOW + 21_000)).toBe(0);
    expect(await settleAll(s, SCENARIO_NOW + 30_000)).toBe(1);
    expect(await parity(s, traces, ["15m", "1h", "24h", "7d"])).toEqual([]);
    await s.db.close();
  });

  it("takes traces past retention out of the rollups and the facts", async () => {
    const s = await scaleDb(1);
    await writeTraces(s, traces);
    await settleAll(s);
    const now = SCENARIO_NOW + 10_000;
    let dropped = 0;
    for (let n = await pruneByRetention(s.db, now); n > 0; n = await pruneByRetention(s.db, now)) dropped += n;
    await pruneRollups(s.db, now, true);
    const kept = traces.filter((t) => t.startMs >= now - DAY);
    expect(dropped).toBe(traces.length - kept.length);
    expect(await count(s, "fact_traces")).toBe(kept.length);
    // The 5 min tier still holds days 1 and 2, so this checks the subtraction, not only the pruning.
    expect(await parity(s, kept, ["15m", "1h", "6h", "24h"])).toEqual([]);
    await s.db.close();
  });

  it("rebuilds the stats when the facts version changes", async () => {
    const s = await scaleDb();
    await writeTraces(s, traces);
    await settleAll(s);
    expect(await checkFactsVersion(s.db)).toBe(true);
    expect(await checkFactsVersion(s.db)).toBe(false);
    await s.db.query("UPDATE scale_meta SET value = '0' WHERE key = 'facts'");
    expect(await checkFactsVersion(s.db)).toBe(true);
    expect([await cloudSettling(s.db, s.projectId), await count(s, "rollup_1h"), await count(s, "fact_logs")]).toEqual([traces.length, 0, 0]);
    await settleAll(s);
    expect(await parity(s, traces, ["1h", "7d"])).toEqual([]);
    await s.db.close();
  });
});
