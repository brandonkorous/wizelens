import { describe, expect, it } from "vitest";
import { makeRequest } from "../testing/fixtures.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { BASE_BUCKET_MS, compact, type StoredContributions, withoutTop } from "./compact.js";
import { mergeDeltas, type SettleDelta, settleDelta } from "./delta.js";
import { FACTS_VERSION, traceFacts } from "./facts.js";
import { histCount } from "./hist.js";
import { ROLLUP_KINDS } from "./kinds.js";

const RETENTION = 30 * 86_400_000;
const scope = { project: "p", env: "prod" };
const traces = scenarioTraces();

/** n, err, sum, counters, and histogram counts per kind. */
function sums(rows: { kind: string; n: number; err: number; sum: number; c: number[]; hist: number }[]) {
  const out: Record<string, number[]> = {};
  for (const r of rows) {
    const s = (out[r.kind] ??= new Array<number>(10).fill(0));
    [r.n, r.err, r.sum, ...r.c.slice(0, 6), r.hist].forEach((v, i) => (s[i]! += v));
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.map((x) => Math.round(x * 1e6) / 1e6)]));
}

const rawSums = (t: (typeof traces)[number]) =>
  sums(traceFacts(t).contributions.map((c) => ({ kind: c.kind, n: c.n, err: c.err, sum: c.sum, c: [...(c.c ?? []), 0, 0, 0, 0, 0, 0], hist: c.values?.length ?? 0 })));

const storedSums = (s: StoredContributions) => sums(s.rows.map((r) => ({ kind: r.k, n: r.n, err: r.err, sum: r.sum, c: [...(r.c ?? []), 0, 0, 0, 0, 0, 0], hist: r.h ? histCount(r.h) : 0 })));

/** Sum the rollup deltas of one tier per kind. */
const tierSums = (d: SettleDelta, tier: string) =>
  sums(d.rollup.filter((r) => r.tier === tier).map((r) => ({ kind: r.kind, n: r.n, err: r.err, sum: r.sum, c: r.c, hist: d.hist.filter((h) => h.tier === tier && h.kind === r.kind && h.key === r.key && h.bucket === r.bucket).reduce((t, h) => t + h.cnt, 0) })));

describe("compact", () => {
  it("keeps every sum per kind, merged per 10 s bucket", () => {
    for (const t of traces) {
      const stored = compact(traceFacts(t), scope);
      expect(storedSums(stored)).toEqual(rawSums(t));
      expect(stored.rows.every((r) => r.b % BASE_BUCKET_MS === 0 && r.f >= r.b && r.l < r.b + BASE_BUCKET_MS)).toBe(true);
      expect(new Set(stored.rows.map((r) => `${r.k}|${r.key}|${r.b}`)).size).toBe(stored.rows.length);
    }
  });

  it("keeps tops for new contributions and drops them for storage", () => {
    const stored = compact(traceFacts(traces[0]!), scope);
    expect(stored.rows.some((r) => r.t !== undefined)).toBe(true);
    expect(withoutTop(stored).rows.every((r) => r.t === undefined && r.r === undefined)).toBe(true);
    expect(stored).toMatchObject({ v: FACTS_VERSION, traceId: traces[0]!.traceId, project: "p", env: "prod" });
  });
});

const recent = traces.filter((t) => t.startMs >= SCENARIO_NOW - 3_600_000).slice(0, 12);

describe("settleDelta", () => {

  it("adds a new trace on all three tiers", () => {
    const t = recent[0]!;
    const d = settleDelta(null, compact(traceFacts(t), scope), SCENARIO_NOW, RETENTION);
    for (const tier of ["10s", "5m", "1h"]) expect(tierSums(d, tier)).toEqual(rawSums(t));
    const failed = recent.find((x) => traceFacts(x).contributions.some((c) => c.kind === "err.g"))!;
    const errors = settleDelta(null, compact(traceFacts(failed), scope), SCENARIO_NOW, RETENTION).rollup.filter((r) => r.kind === "err.g");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((r) => r.ids === failed.traceId && r.top !== null && r.topRank !== null)).toBe(true);
  });

  it("nets to zero when a change is undone", () => {
    const before = makeRequest({ startMs: SCENARIO_NOW - 60_000, queries: [{ sql: "SELECT 1", ms: 3 }] });
    const after = makeRequest({ startMs: SCENARIO_NOW - 60_000, status: 500, error: { type: "E", message: "x" }, queries: [{ sql: "SELECT 1", ms: 300 }, { sql: "SELECT 2", ms: 2 }] });
    const old = compact(traceFacts(before), scope);
    const next = compact(traceFacts(after), scope);
    const both = mergeDeltas([settleDelta(old, next, SCENARIO_NOW, RETENTION), settleDelta(next, old, SCENARIO_NOW, RETENTION)]);
    for (const r of both.rollup) for (const v of [r.n, r.err, r.sum, ...r.c]) expect(Math.abs(v)).toBeLessThan(1e-9);
    expect(both.hist).toEqual([]);
    expect(settleDelta(old, old, SCENARIO_NOW, RETENTION).rollup.every((r) => r.n === 0 && r.firstMs !== null)).toBe(true);
  });

  it("subtracts an old contribution without touching first, last, or top", () => {
    const old = compact(traceFacts(recent[1]!), scope);
    const d = settleDelta(old, null, SCENARIO_NOW, RETENTION);
    expect(d.rollup.length).toBeGreaterThan(0);
    expect(d.rollup.every((r) => r.n < 0 && r.firstMs === null && r.lastMs === null && r.top === null && r.ids === "")).toBe(true);
    expect(d.hist.every((h) => h.cnt < 0)).toBe(true);
  });
});

describe("settleDelta over tiers and batches", () => {
  it("skips buckets a tier no longer keeps", () => {
    const old = traces.find((t) => t.startMs < SCENARIO_NOW - 3 * 86_400_000 && t.startMs > SCENARIO_NOW - 6 * 86_400_000)!;
    const d = settleDelta(null, compact(traceFacts(old), scope), SCENARIO_NOW, RETENTION);
    expect(new Set(d.rollup.map((r) => r.tier))).toEqual(new Set(["1h"]));
    const gone = traces[traces.length - 1]!;
    expect(settleDelta(null, compact(traceFacts(gone), scope), SCENARIO_NOW, 7 * 86_400_000).rollup).toEqual([]);
  });

  it("merges a batch per row, newest ids first", () => {
    const parts = recent.map((t) => settleDelta(null, compact(traceFacts(t), scope), SCENARIO_NOW, RETENTION));
    const merged = mergeDeltas(parts);
    const kinds = ROLLUP_KINDS.filter((k) => parts.some((p) => p.rollup.some((r) => r.kind === k)));
    const want = sums(parts.flatMap((p) => p.rollup.filter((r) => r.tier === "1h")).map((r) => ({ ...r, hist: 0 })));
    expect(sums(merged.rollup.filter((r) => r.tier === "1h").map((r) => ({ ...r, hist: 0 })))).toEqual(want);
    expect(Object.keys(want).sort()).toEqual([...kinds].sort());
    const ids = merged.rollup.filter((r) => r.kind === "err.g" && r.tier === "1h").flatMap((r) => r.ids.split(" "));
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(merged.rollup.map((r) => `${r.tier}|${r.kind}|${r.key}|${r.bucket}`)).size).toBe(merged.rollup.length);
  });
});
