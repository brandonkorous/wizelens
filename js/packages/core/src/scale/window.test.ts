import { describe, expect, it } from "vitest";
import { previousWindow, TIME_RANGES, type TimeRange, type TimeWindow, windowOf } from "../stats/common.js";
import { SCENARIO_NOW } from "../testing/scenario.js";
import { alignNow, isKept, planSeries, planTotals, type Segment, snapWindow, spreadBucket, tierCutoff, TIERS } from "./window.js";

const RETENTION = 30 * 86_400_000;
const covered = (segs: Segment[]) => segs.reduce((t, s) => t + (s.to - s.from) * s.weight, 0);

/** Every millisecond of the window is in exactly one whole bucket, and nothing outside it is. */
function expectExact(w: TimeWindow, segs: Segment[]): void {
  const sorted = [...segs].sort((a, b) => a.from - b.from);
  expect(sorted.every((s) => s.weight === 1)).toBe(true);
  expect(sorted[0]!.from).toBe(w.from);
  expect(sorted[sorted.length - 1]!.to).toBe(w.to);
  for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.from).toBe(sorted[i - 1]!.to);
  for (const s of sorted) expect((s.from % s.tier.ms) + (s.to % s.tier.ms)).toBe(0);
}

describe("planTotals", () => {
  it("covers windows exactly where the tiers are kept", () => {
    const nows = [SCENARIO_NOW, SCENARIO_NOW + 1_230_000, SCENARIO_NOW + 3_590_000];
    for (const now of nows) {
      for (const range of ["15m", "1h", "6h"] as TimeRange[]) {
        const w = windowOf(range, now);
        expectExact(w, planTotals(w, now, RETENTION));
      }
    }
    // A day back only the 5 min and 1 h tiers are kept, so "now" must sit on a 5 min edge.
    for (const now of [SCENARIO_NOW, SCENARIO_NOW + 25 * 60_000]) expectExact(windowOf("24h", now), planTotals(windowOf("24h", now), now, RETENTION));
  });

  it("uses the coarse tiers for long windows", () => {
    expect(new Set(planTotals(windowOf("24h", SCENARIO_NOW), SCENARIO_NOW, RETENTION).map((s) => s.tier.name))).toEqual(new Set(["1h"]));
    const week = planTotals(windowOf("7d", SCENARIO_NOW + 1_230_000), SCENARIO_NOW + 1_230_000, RETENTION);
    expect(week.map((s) => s.tier.name)).toContain("10s");
    expect(week.find((s) => s.tier.name === "1h" && s.weight === 1)).toBeDefined();
  });

  it("weights a partial edge bucket when no finer tier is kept that far back", () => {
    const now = SCENARIO_NOW + 1_230_000;
    for (const range of Object.keys(TIME_RANGES) as TimeRange[]) {
      for (const w of [windowOf(range, now), previousWindow(windowOf(range, now))]) {
        const segs = planTotals(w, now, RETENTION);
        expect(covered(segs)).toBeCloseTo(w.to - w.from, 6);
        expect(segs.filter((s) => s.weight < 1).length).toBeLessThanOrEqual(2);
        for (const s of segs.filter((x) => x.weight < 1)) expect(s.to - s.from).toBe(s.tier.ms);
      }
    }
    const old = previousWindow(windowOf("7d", now));
    const edge = planTotals(old, now, RETENTION).find((s) => s.weight < 1)!;
    expect(edge).toMatchObject({ tier: TIERS[2], weight: (edge.to - old.from) / 3_600_000 });
  });

  it("keeps a bucket while it is newer than now minus the tier's keep time", () => {
    expect(isKept(TIERS[0]!, SCENARIO_NOW - 6 * 3_600_000, SCENARIO_NOW, RETENTION)).toBe(true);
    expect(isKept(TIERS[0]!, SCENARIO_NOW - 7 * 3_600_000, SCENARIO_NOW, RETENTION)).toBe(false);
    expect(isKept(TIERS[2]!, SCENARIO_NOW - 29 * 86_400_000, SCENARIO_NOW, RETENTION)).toBe(true);
    expect(alignNow(SCENARIO_NOW + 9_999)).toBe(SCENARIO_NOW);
    expect(planTotals({ from: 5, to: 5 }, SCENARIO_NOW, RETENTION)).toEqual([]);
  });
});

describe("planSeries", () => {
  const plan = (range: TimeRange, buckets: number) => {
    const p = planSeries(windowOf(range, SCENARIO_NOW), buckets, SCENARIO_NOW, RETENTION);
    return `${p.tier.name} ${p.mode}`;
  };

  it("picks the tier and mode per range and bucket count", () => {
    const table: [TimeRange, number, string][] = [
      ["15m", 48, "10s split"], ["15m", 24, "10s split"], ["15m", 16, "10s split"],
      ["1h", 48, "10s split"], ["1h", 24, "10s sql"], ["1h", 16, "10s sql"],
      ["6h", 48, "10s sql"], ["6h", 24, "10s sql"],
      ["24h", 48, "5m split"], ["24h", 24, "5m sql"], ["24h", 16, "5m sql"],
      ["7d", 48, "1h split"], ["7d", 24, "1h split"], ["7d", 16, "1h sql"],
      ["30d", 48, "1h sql"], ["30d", 24, "1h sql"],
    ];
    for (const [range, buckets, want] of table) expect(`${range}/${buckets} ${plan(range, buckets)}`).toBe(`${range}/${buckets} ${want}`);
  });

  it("uses a coarser kept tier for an old previous window", () => {
    const w = previousWindow(windowOf("24h", SCENARIO_NOW));
    expect(planSeries(w, 24, SCENARIO_NOW, RETENTION).tier.name).toBe("5m");
    expect(planSeries(previousWindow(windowOf("6h", SCENARIO_NOW)), 48, SCENARIO_NOW, RETENTION).tier.name).toBe("5m");
  });

  it("spreads a tier bucket over page buckets by overlap", () => {
    const w = { from: 0, to: 1000 };
    expect(spreadBucket(300, 100, w, 4)).toEqual([{ index: 1, share: 1 }]);
    expect(spreadBucket(200, 100, w, 8)).toEqual([{ index: 1, share: 0.5 }, { index: 2, share: 0.5 }]);
    expect(spreadBucket(950, 100, w, 4)).toEqual([{ index: 3, share: 0.5 }]);
  });
});

describe("tier keep", () => {
  it("keeps a bucket while any part of it is newer than now minus keep", () => {
    const hour = TIERS[2]!;
    const keep = 7 * 86_400_000;
    const now = SCENARIO_NOW + 1_800_000;
    expect(isKept(hour, now - keep - 1_000, now, keep)).toBe(true);
    expect(isKept(hour, now - keep - 3_600_000, now, keep)).toBe(false);
    expect(tierCutoff(hour, now, keep)).toBe(now - keep - 3_600_000);
  });
});

describe("snapWindow", () => {
  it("moves the start back to a kept tier edge, so every range is exact", () => {
    for (const now of [SCENARIO_NOW + 1_230_000, SCENARIO_NOW + 3_590_000]) {
      for (const range of Object.keys(TIME_RANGES) as TimeRange[]) {
        const raw = windowOf(range, now);
        const w = snapWindow(raw, now);
        expect(raw.from - w.from, range).toBeLessThan(3_600_000);
        expectExact(w, planTotals(w, now, RETENTION));
      }
    }
  });
});
