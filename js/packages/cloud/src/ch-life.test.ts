import { afterAll, describe, expect, it } from "vitest";
import { buildTrace, type Trace, windowOf } from "@wizeworks/lens-core";
import { SCENARIO_NOW, scenarioTraces } from "../../core/src/testing/scenario.js";
import { searchParity } from "../../core/src/testing/search-parity.js";
import { CH_LIMIT, CH_URL, type ChTest, chSettle, chTest, chWrite, testOrgOf } from "./test/ch.js";
import { parity } from "./test/scale.js";
import { chClient } from "./telemetry/ch/http.js";
import { openClickHouse } from "./telemetry/ch/store.js";

const traces = scenarioTraces();
const opened: ChTest[] = [];
afterAll(async () => Promise.all(opened.map((t) => t.drop())));

/** The first or second half of each trace's spans and logs. */
const half = (list: readonly Trace[], second: boolean): Trace[] =>
  list.map((t) => {
    const cut = <T>(xs: readonly T[]) => (second ? xs.slice(Math.ceil(xs.length / 2)) : xs.slice(0, Math.ceil(xs.length / 2)));
    return buildTrace(t.traceId, cut(t.spans), cut(t.logs), []);
  });

async function until(check: () => Promise<boolean>, ms = 20_000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("Timed out");
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe.skipIf(!CH_URL)("ClickHouse store over time", () => {
  it("settles traces again when more parts arrive, replacing what changed", async () => {
    const t = await chTest();
    opened.push(t);
    await chWrite(t, half(traces, false));
    await chSettle(t);
    const rest = half(traces, true).filter((x) => x.spans.length + x.logs.length > 0);
    await chWrite(t, rest, SCENARIO_NOW + 20_000);
    expect(await chSettle(t, SCENARIO_NOW + 40_000)).toBe(rest.length);
    expect(await parity({ ex: t.store.executor(t.projectId, t.retentionMs), retentionMs: t.retentionMs } as never, traces)).toEqual([]);
    const windows = [windowOf("30d", SCENARIO_NOW + 40_000)];
    expect(await searchParity((q) => t.store.search(t.projectId, q), traces, windows, "prod")).toEqual([]);
  }, CH_LIMIT);

  it("clears a project's telemetry", async () => {
    const t = await chTest();
    opened.push(t);
    await chWrite(t, traces.slice(0, 20));
    await chSettle(t);
    await t.store.clearProject(t.projectId);
    await until(async () => (await t.store.counts(t.projectId)).traces === 0);
    const page = await t.store.search(t.projectId, { kind: "spans", node: null, window: windowOf("30d", SCENARIO_NOW), limit: 10 });
    await until(async () => (await t.store.search(t.projectId, { kind: "spans", node: null, window: windowOf("30d", SCENARIO_NOW), limit: 10 })).items.length === 0);
    expect(page.kind).toBe("spans");
  }, CH_LIMIT);

  it("drops rows past retention on insert, by TTL", async () => {
    const name = `wl_test_ttl_${Date.now().toString(36)}`;
    const url = `${CH_URL.replace(/\/$/, "")}/${name}`;
    const store = await openClickHouse({ url, retentionOf: async (ids) => new Map(ids.map((id) => [id, 1])), orgOf: testOrgOf, defaultRetentionDays: 1, now: Date.now });
    opened.push({ store, projectId: "p", retentionMs: 0, url, drop: () => chClient({ url: url.replace(name, "default") }).command(`DROP DATABASE IF EXISTS ${name}`) });
    const shift = (t: Trace, by: number) => buildTrace(t.traceId, t.spans.map((s) => ({ ...s, startMs: s.startMs + by })), [], []);
    const [old, fresh] = [shift(traces[0]!, Date.now() - 3 * 86_400_000 - SCENARIO_NOW), shift(traces[1]!, Date.now() - SCENARIO_NOW)];
    for (const tr of [old, fresh]) await store.write("p", { sender: { service: "api" }, via: "addon", spans: tr.spans, logs: [], remotes: [] }, Date.now());
    expect(await store.trace("p", old.traceId)).toBeUndefined();
    expect((await store.trace("p", fresh.traceId))?.spanCount).toBe(fresh.spanCount);
  }, CH_LIMIT);
});
