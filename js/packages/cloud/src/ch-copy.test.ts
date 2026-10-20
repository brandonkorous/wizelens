import { afterAll, describe, expect, it } from "vitest";
import { SCENARIO_NOW, scenarioTraces } from "../../core/src/testing/scenario.js";
import { copyTelemetry } from "./telemetry/copy.js";
import { CH_LIMIT, CH_URL, type ChTest, chSettle, chTest } from "./test/ch.js";
import { parity, scaleDb, writeTraces } from "./test/scale.js";

const traces = scenarioTraces();
let t: ChTest | undefined;
afterAll(async () => t?.drop());

describe.skipIf(!CH_URL)("copying telemetry into ClickHouse", () => {
  it("copies every project's traces, which then settle to the same stats", async () => {
    const pg = await scaleDb();
    await writeTraces(pg, traces);
    t = await chTest();
    const lines: string[] = [];
    const done = await copyTelemetry(pg.db, t.store, SCENARIO_NOW, (l) => lines.push(l));
    expect(done.traces).toBe(traces.length);
    await chSettle(t);
    const ex = t.store.executor(pg.projectId, t.retentionMs);
    expect(await parity({ ex, retentionMs: t.retentionMs } as never, traces)).toEqual([]);
    const again = await copyTelemetry(pg.db, t.store, SCENARIO_NOW, (l) => lines.push(l));
    expect(again.traces).toBe(0);
    expect(lines.at(-1)).toContain("already copied");
    await pg.db.close();
  }, CH_LIMIT);
});
