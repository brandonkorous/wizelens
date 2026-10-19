import { afterAll, describe, expect, it } from "vitest";
import { SCENARIO_NOW, scenarioTraces } from "../../core/src/testing/scenario.js";
import { CH_URL, type ChTest, chSettle, chTest, chWrite } from "./test/ch.js";

const opened: ChTest[] = [];
afterAll(async () => {
  for (const t of opened) await t.store.close();
  await Promise.all(opened.map((t) => t.drop()));
});

describe.skipIf(!CH_URL)("ClickHouse settle", () => {
  // The cloud's settle job can run when a caller settles too; the caller's settle must still mean "it is in ClickHouse".
  it("returns only after what was due is searchable, also while another settle runs", async () => {
    const traces = scenarioTraces().slice(0, 30);
    const t = await chTest();
    opened.push(t);
    await chWrite(t, traces);
    const other = chSettle(t);
    await chSettle(t);
    const page = await t.store.search(t.projectId, { kind: "traces", node: null, window: { from: 0, to: SCENARIO_NOW + 60_000 }, limit: 200, cursor: null });
    expect(new Set(page.items.map((i) => (i as { traceId: string }).traceId)).size).toBe(traces.length);
    await other;
  }, 120_000);
});
