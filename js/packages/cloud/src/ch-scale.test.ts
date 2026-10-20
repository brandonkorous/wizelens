import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { windowOf } from "@wizeworks/lens-core";
import { pageParity } from "../../core/src/testing/scale-pages.js";
import { SCENARIO_NOW, scenarioTraces } from "../../core/src/testing/scenario.js";
import { searchParity, suggestParity } from "../../core/src/testing/search-parity.js";
import { tagParity } from "../../core/src/testing/tag-parity.js";
import { CH_LIMIT, CH_URL, type ChTest, chSettle, chTest, chWrite } from "./test/ch.js";
import { parity, RANGES } from "./test/scale.js";

const traces = scenarioTraces();
let t: ChTest;

describe.skipIf(!CH_URL)("ClickHouse store", () => {
  beforeAll(async () => {
    t = await chTest();
    await chWrite(t, traces);
    expect(await t.store.settling(t.projectId)).toBe(traces.length);
    expect(await chSettle(t)).toBe(traces.length);
  }, CH_LIMIT);
  afterAll(async () => t && (await t.drop()));

  it("answers every need like the memory executor", async () => {
    const ex = t.store.executor(t.projectId, t.retentionMs);
    expect(await parity({ ex, retentionMs: t.retentionMs } as never, traces)).toEqual([]);
    expect(await parity({ ex: t.store.executor(t.projectId, t.retentionMs, "prod"), retentionMs: t.retentionMs } as never, traces, ["24h"])).toEqual([]);
  }, CH_LIMIT);

  it("computes every page like the memory executor", async () => {
    expect(await pageParity(t.store.executor(t.projectId, t.retentionMs), traces, RANGES, t.retentionMs)).toEqual([]);
  }, CH_LIMIT);

  it("searches and suggests like the memory runner", async () => {
    const windows = [windowOf("30d", SCENARIO_NOW), windowOf("1h", SCENARIO_NOW)];
    expect(await searchParity((q) => t.store.search(t.projectId, q), traces, windows, "prod")).toEqual([]);
    expect(await suggestParity((r) => t.store.suggest(t.projectId, r), traces, windows[0]!)).toEqual([]);
    expect(await tagParity((q) => t.store.search(t.projectId, q), traces, windows[0]!, "prod")).toEqual([]);
  }, CH_LIMIT);

  it("reads traces back whole, and lists them newest first", async () => {
    const want = traces[3]!;
    const got = await t.store.trace(t.projectId, want.traceId);
    expect(got?.spanCount).toBe(want.spanCount);
    expect(got?.logs.length).toBe(want.logs.length);
    const list = await t.store.traces({ projectId: t.projectId, limit: 5, before: SCENARIO_NOW + 1 });
    const newest = [...traces].sort((a, b) => b.startMs - a.startMs).slice(0, 5).map((x) => x.traceId);
    expect(list.map((x) => x.traceId)).toEqual(newest);
    expect((await t.store.counts(t.projectId)).traces).toBe(traces.length);
  });
});
