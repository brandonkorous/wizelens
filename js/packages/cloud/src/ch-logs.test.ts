import { afterAll, describe, expect, it } from "vitest";
import { isListedTrace, isLooseTraceId, type Trace } from "@wizeworks/lens-core";
import { SCENARIO_NOW, scenarioTraces } from "../../core/src/testing/scenario.js";
import { CH_LIMIT, CH_URL, type ChTest, chSettle, chTest, chWrite } from "./test/ch.js";
import { chClient } from "./telemetry/ch/http.js";

const DAY = 86_400_000;
const traces = scenarioTraces().slice(0, 33);
const loose = traces.find((t) => isLooseTraceId(t.traceId))!;
const traced = traces.find((t) => isListedTrace(t) && t.logs.length > 0)!;
const opened: ChTest[] = [];
afterAll(async () => Promise.all(opened.map((t) => t.drop())));

/** Kept days of a table's rows of one trace (or kind), read from their expiry. */
async function keptDays(t: ChTest, sql: string, time: string): Promise<number[]> {
  const rows = await chClient({ url: t.url }).query<{ d: number }>(`SELECT DISTINCT round((expire_ms - ${time}) / ${DAY}) AS d FROM ${sql}`);
  return rows.map((r) => Number(r.d)).sort((a, b) => a - b);
}

const of = (tr: Trace) => `trace_id = '${tr.traceId}'`;

async function until(check: () => Promise<boolean>, ms = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("Timed out");
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe.skipIf(!CH_URL)("ClickHouse log retention", () => {
  it("expires log rows by the project's log retention, and moves them when it changes", async () => {
    let logDays = 4;
    const t = await chTest(30, SCENARIO_NOW, { logRetentionOf: async (ids) => new Map(ids.map((id) => [id, logDays])) });
    opened.push(t);
    await chWrite(t, traces);
    await chSettle(t);
    expect(await keptDays(t, `logs_raw WHERE ${of(loose)}`, "time_ms")).toEqual([4]);
    expect(await keptDays(t, `logs_raw WHERE ${of(traced)}`, "time_ms")).toEqual([4]);
    expect(await keptDays(t, `trace_heads WHERE ${of(loose)}`, "start_ms")).toEqual([4]);
    expect(await keptDays(t, `trace_heads WHERE ${of(traced)}`, "start_ms")).toEqual([30]);
    expect(await keptDays(t, "fact_logs_t", "time_ms")).toEqual([4]);
    expect(await keptDays(t, "fact_traces_t", "start_ms")).toEqual([30]);
    expect(await keptDays(t, "rollup_1h_t WHERE kind IN ('log', 'log.p')", "bucket_ms")).toEqual([4]);
    expect(await keptDays(t, "rollup_1h_t WHERE kind = 'trace'", "bucket_ms")).toEqual([30]);
    await t.store.prune(SCENARIO_NOW);
    logDays = 60;
    await t.store.prune(SCENARIO_NOW + 1);
    await until(async () => (await keptDays(t, `logs_raw WHERE ${of(loose)}`, "time_ms")).join() === "60");
    await until(async () => (await keptDays(t, "rollup_1h_t WHERE kind = 'log'", "bucket_ms")).join() === "60");
    expect(await keptDays(t, `logs_raw WHERE ${of(traced)}`, "time_ms")).toEqual([30]);
    expect(await keptDays(t, "rollup_1h_t WHERE kind = 'trace'", "bucket_ms")).toEqual([30]);
  }, CH_LIMIT);
});
