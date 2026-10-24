import { afterAll, describe, expect, it } from "vitest";
import type { Trace } from "@wizeworks/lens-core";
import { SCENARIO_NOW, scenarioTraces } from "../../core/src/testing/scenario.js";
import { chClient } from "./telemetry/ch/http.js";
import { CH_LIMIT, CH_URL, type ChTest, chSettle, chTest, chWrite } from "./test/ch.js";

const opened: ChTest[] = [];
afterAll(async () => {
  for (const t of opened) await t.store.close();
  await Promise.all(opened.map((t) => t.drop()));
});

/** The trace with its first span's `test.color` attribute set. */
const colored = (tr: Trace, color: string): Trace => ({ ...tr, spans: tr.spans.map((s, i) => (i ? s : { ...s, attributes: { ...s.attributes, "test.color": color } })) });

describe.skipIf(!CH_URL)("ClickHouse re-settle tombstones", () => {
  // Old fact rows come from the keys settle_state kept, or by a scan for states kept before them.
  it("removes the fact rows a trace no longer has, from kept keys and without them", async () => {
    const base = scenarioTraces().find((tr) => tr.spans.length > 0)!;
    const t = await chTest();
    opened.push(t);
    const ch = chClient({ url: t.url });
    const colors = async () => (await ch.query<{ value: string }>(`SELECT value FROM fact_attrs WHERE trace_id = {p1:String} AND value IN ('red', 'blue', 'green')`, [base.traceId])).map((r) => r.value);
    const keysOf = async () => (await ch.query<{ k: string }>("SELECT fact_keys AS k FROM settle_state FINAL WHERE trace_id = {p1:String}", [base.traceId]))[0]?.k ?? "";
    const window = { from: 0, to: SCENARIO_NOW + 3_600_000 };
    const suggested = async () => (await t.store.suggest(t.scope, { field: "@test.color", prefix: "", window, limit: 10 })).map((x) => [x.value, x.count]);
    const round = async (color: string, at: number) => {
      await chWrite(t, [colored(base, color)], at);
      await chSettle(t, at + 10_000);
    };

    await round("red", SCENARIO_NOW);
    expect(await colors()).toEqual(["red"]);
    expect(JSON.parse(await keysOf())).toHaveProperty("fact_attrs");

    await round("blue", SCENARIO_NOW + 60_000);
    expect(await colors()).toEqual(["blue"]);
    // The attribute counts took red away and added blue once; unchanged attributes were not written again.
    expect(await suggested()).toEqual([["blue", 1]]);
    expect((await t.store.suggest(t.scope, { field: null, prefix: "@test.co", window, limit: 10 })).map((x) => [x.value, x.count])).toEqual([["@test.color", 1]]);

    // A state from before keys were kept: the same row with no keys, at a newer version.
    await ch.command(`INSERT INTO settle_state (project_id, org_id, trace_id, settled_ms, contrib, ver, expire_ms, fact_keys)
      SELECT project_id, org_id, trace_id, settled_ms, contrib, ver + 1, expire_ms, '' FROM settle_state FINAL WHERE trace_id = '${base.traceId}'`);
    expect(await keysOf()).toBe("");
    await round("green", SCENARIO_NOW + 120_000);
    expect(await colors()).toEqual(["green"]);
    expect(await suggested()).toEqual([["green", 1]]);
    expect(JSON.parse(await keysOf())).toHaveProperty("fact_attrs");
  }, CH_LIMIT);
});
