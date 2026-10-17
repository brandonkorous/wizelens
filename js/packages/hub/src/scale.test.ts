import { describe, expect, it } from "vitest";
import { scenarioTraces } from "../../core/src/testing/scenario.js";
import { hubExecutor, hubSettling } from "./scale-exec.js";
import { settleHub } from "./settle.js";
import { clockStore, parity, settleAll, writeTraces } from "./test/scale.js";

const traces = scenarioTraces();

describe("hub stats tables", () => {
  it("settles the scenario and answers every need like the memory executor", async () => {
    const { store, clock } = clockStore();
    writeTraces(store, traces);
    expect(hubSettling(store)).toBe(traces.length);
    const t0 = performance.now();
    expect(settleAll(store, clock)).toBe(traces.length);
    const settleMs = performance.now() - t0;
    expect(hubSettling(store)).toBeNull();
    expect(store.settleGen).toBe(1);
    expect(await parity(hubExecutor(store), traces)).toEqual([]);
    expect(await parity(hubExecutor(store, { project: "shop", env: "prod" }), traces, ["24h"])).toEqual([]);
    const other = await hubExecutor(store, { project: "admin" }).run([{ type: "groups", id: "g", kind: "req", window: "cur" }], (await import("@wizeworks/lens-core")).pageContext("30d", clock.now, {}));
    expect(other.groups.g!.rows).toEqual([]);
    console.log(`hub settle of ${traces.length} traces: ${settleMs.toFixed(0)} ms`);
  });

  it("waits for a written-to trace to go quiet before settling it again", () => {
    const { store, clock } = clockStore();
    writeTraces(store, traces.slice(0, 3));
    expect(settleAll(store, clock)).toBe(3);
    writeTraces(store, traces.slice(0, 1));
    clock.now += 1_000;
    expect(settleHub(store)).toBe(0);
    expect(hubSettling(store, { project: "shop" })).toBe(1);
    expect(hubSettling(store, { project: "admin" })).toBeNull();
    expect(settleAll(store, clock)).toBe(1);
  });

  it("finds differences when the data differs", async () => {
    const { store, clock } = clockStore();
    writeTraces(store, traces);
    settleAll(store, clock);
    expect((await parity(hubExecutor(store), traces.slice(1), ["1h"])).length).toBeGreaterThan(5);
  });
});
