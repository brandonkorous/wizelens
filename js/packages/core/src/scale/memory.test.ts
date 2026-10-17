import { describe, expect, it } from "vitest";
import { inWindow, percentileOf, series, type TimeRange } from "../stats/common.js";
import { levelCounts, logRows } from "../stats/logs.js";
import { pageViews } from "../stats/rendering.js";
import { isFailed, requestRows } from "../stats/requests.js";
import { serviceRows } from "../stats/services.js";
import { relErr } from "../testing/scale-util.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { avgOfAgg } from "./agg.js";
import { histPercentile } from "./hist.js";
import { KEY_SEP, splitKey } from "./kinds.js";
import { memoryExecutor } from "./memory.js";
import { type Need, type PageContext, type PageDef, windowOfRef, type WindowRef } from "./needs.js";
import { computePageSync, pageContext } from "./run.js";

const traces = scenarioTraces();
const ex = memoryExecutor(traces);
const RANGES: TimeRange[] = ["15m", "1h", "24h", "7d"];
const WINDOWS: WindowRef[] = ["cur", "prev"];
const run = (need: Need, ctx: PageContext) => ex.runSync([need], ctx);
const inWin = (ctx: PageContext, ref: WindowRef) => traces.filter((t) => inWindow(t.startMs, windowOfRef(ctx, ref)));

describe("memory executor: groups", () => {
  it("req totals match the request rows of each window", () => {
    for (const range of RANGES) {
      for (const ref of WINDOWS) {
        const ctx = pageContext(range, SCENARIO_NOW, {});
        const want = requestRows(inWin(ctx, ref));
        const rows = run({ type: "groups", id: "g", kind: "req", window: ref }, ctx).groups.g!.rows;
        expect(rows.length).toBe(want.length ? 1 : 0);
        expect([rows[0]?.agg.n ?? 0, rows[0]?.agg.err ?? 0]).toEqual([want.length, want.filter(isFailed).length]);
        expect(want.length).toBeGreaterThan(0);
      }
    }
  });

  it("filters by prefix and keys, orders, limits, and still counts all rows", () => {
    const ctx = pageContext("24h", SCENARIO_NOW, {});
    const apis = serviceRows(inWin(ctx, "cur")).filter((r) => r.kind === "api").sort((a, b) => b.requests - a.requests || (a.key < b.key ? -1 : 1));
    const g = run({ type: "groups", id: "g", kind: "svc", window: "cur", filter: { prefix: "api:" }, order: { by: "n", desc: true, limit: 2 } }, ctx).groups.g!;
    expect(g.total).toBe(apis.length);
    expect(g.rows.map((r) => [r.key, r.agg.n])).toEqual(apis.slice(0, 2).map((r) => [r.key, r.requests]));
    const keys = run({ type: "groups", id: "g", kind: "svc", window: "cur", filter: { keys: ["db:sqlite · shop", "db:nope"] } }, ctx).groups.g!;
    expect(keys.rows.map((r) => r.key)).toEqual(["db:sqlite · shop"]);
    const asc = run({ type: "groups", id: "g", kind: "svc", window: "cur", order: { by: "avg", desc: false, limit: 100 } }, ctx).groups.g!.rows;
    expect(asc.map((r) => avgOfAgg(r.agg)!)).toEqual([...asc.map((r) => avgOfAgg(r.agg)!)].sort((a, b) => a - b));
  });

  it("matches key parts and returns only the asked-for extras", () => {
    const ctx = pageContext("1h", SCENARIO_NOW, {});
    const g = run({ type: "groups", id: "g", kind: "req.dim", window: "cur", filter: { parts: ["POST", null, "1", null] } }, ctx).groups.g!;
    expect(g.rows.length).toBeGreaterThan(0);
    expect(g.rows.every((r) => splitKey(r.key)[0] === "POST" && splitKey(r.key)[2] === "1")).toBe(true);
    const bare = run({ type: "groups", id: "g", kind: "err.g", window: "cur" }, ctx).groups.g!.rows[0]!.agg;
    expect([bare.hist, bare.top, bare.ids]).toEqual([null, null, []]);
    const full = run({ type: "groups", id: "g", kind: "err.g", window: "cur", top: true, ids: true }, ctx).groups.g!.rows[0]!.agg;
    expect(full.top).not.toBeNull();
    expect(full.ids.length).toBeGreaterThan(0);
    const svc = run({ type: "groups", id: "g", kind: "svc", window: "cur", hist: true }, ctx).groups.g!.rows[0]!.agg;
    expect(svc.hist).not.toBeNull();
  });
});

describe("memory executor: series", () => {
  it("req per bucket matches `series` over the request rows", () => {
    for (const range of RANGES) {
      const ctx = pageContext(range, SCENARIO_NOW, {});
      const rows = requestRows(inWin(ctx, "cur"));
      const s = run({ type: "series", id: "s", kind: "req", window: "cur", buckets: 24 }, ctx).series.s!.byKey[""]!;
      expect(s.map((a) => a.n)).toEqual(series(rows, (r) => r.startMs, ctx.window, 24));
      expect(s.map((a) => avgOfAgg(a))).toEqual(series(rows, (r) => r.startMs, ctx.window, 24, "avg", (r) => r.durationMs));
      expect(s.every((a) => a.hist === null && a.firstMs === 0 && a.top === null)).toBe(true);
    }
  });

  it("splits per key and keeps histograms when asked", () => {
    const ctx = pageContext("24h", SCENARIO_NOW, {});
    const logs = logRows(inWin(ctx, "cur"));
    const split = run({ type: "series", id: "s", kind: "log", window: "cur", buckets: 48, split: true }, ctx).series.s!.byKey;
    const counts = levelCounts(logs);
    for (const [level, list] of Object.entries(split)) expect(list.reduce((t, a) => t + a.n, 0)).toBe(counts[level as keyof typeof counts]);
    const views = pageViews(inWin(ctx, "cur"));
    const p75 = run({ type: "series", id: "s", kind: "pv.g", window: "cur", buckets: 24, filter: { keys: ["render"] }, hist: true }, ctx).series.s!.byKey[""]!;
    p75.forEach((a, i) => {
      const inBucket = views.filter((v) => Math.floor(((v.startMs - ctx.window.from) / (ctx.window.to - ctx.window.from)) * 24) === i).map((v) => v.renderMs!);
      const want = percentileOf(inBucket, 75);
      if (want === null) expect(a.n).toBe(0);
      else expect(relErr(histPercentile(a.hist!, a.n, 75)!, want)).toBeLessThanOrEqual(0.02);
    });
  });
});

describe("memory executor: traces and pages", () => {
  it("finds a trace by id in the windows, else the newest in cur", () => {
    const ctx = pageContext("1h", SCENARIO_NOW, {});
    const prev = inWin(ctx, "prev")[0]!;
    const newest = inWin(ctx, "cur")[0]!;
    const got = ex.runSync([
      { type: "trace", id: "a", traceId: prev.traceId, windows: ["cur", "prev"] },
      { type: "trace", id: "b", traceId: prev.traceId, windows: ["cur"] },
      { type: "trace", id: "c", traceId: null, windows: ["cur"] },
    ], ctx).traces;
    expect([got.a?.traceId, got.b?.traceId, got.c?.traceId]).toEqual([prev.traceId, newest.traceId, newest.traceId]);
  });

  it("computes a page from its needs and follow-up needs", () => {
    const def: PageDef<{ services: number; detail: number }> = {
      needs: () => [{ type: "groups", id: "svc", kind: "svc", window: "cur", order: { by: "n", desc: true, limit: 1 } }],
      followUp: (_ctx, first) => [{ type: "groups", id: "ep", kind: "svc.ep", window: "cur", filter: { prefix: first.groups.svc!.rows[0]!.key + KEY_SEP } }],
      model: (d) => ({ services: d.groups.svc!.total, detail: d.groups.ep!.total }),
    };
    const ctx = pageContext("24h", SCENARIO_NOW, { any: "x" });
    const m = computePageSync(def, ctx, ex);
    expect(m.services).toBe(serviceRows(inWin(ctx, "cur")).length + 1);
    expect(m.detail).toBeGreaterThan(0);
    expect(ctx).toMatchObject({ range: "24h", now: SCENARIO_NOW, params: { any: "x" }, options: { slowQueryMs: 100 }, settling: null });
  });
});
