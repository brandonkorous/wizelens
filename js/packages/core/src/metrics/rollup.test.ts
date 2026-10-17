import { describe, expect, it } from "vitest";
import { diffClose, METRIC_NOW, metricScenario } from "../testing/metric-scenario.js";
import { metricDataOf } from "./memory.js";
import { metricsModelOf } from "./model.js";
import { metricPointRow, metricSeriesRows, metricTierRows } from "./rollup.js";
import type { MetricPoint } from "./types.js";

const counter = (timeMs: number, value: number, extra: Partial<MetricPoint> = {}): MetricPoint => ({
  name: "c", kind: "sum", unit: "1", service: "api", attributes: {}, monotonic: true, temporality: "cumulative", timeMs, value, ...extra,
});
const hist = (timeMs: number, count: number, counts: number[], bounds = [1, 10]): MetricPoint => ({
  name: "h", kind: "histogram", unit: "s", service: "api", attributes: {}, temporality: "cumulative", timeMs, histogram: { count, sum: count, bounds, counts },
});
const rates = (points: MetricPoint[]) => metricSeriesRows(points, null).rows.map((r) => [r.row.rateDelta, r.row.rateMs]);

describe("metric rollup rows", () => {
  it("turns a cumulative counter into deltas, and a drop into a restart", () => {
    expect(rates([100, 160, 10, 70].map((v, i) => counter(i * 10_000, v)))).toEqual([[0, 0], [60, 10_000], [10, 10_000], [60, 10_000]]);
  });

  it("takes delta counters as they are, over startMs or the gap to the previous point", () => {
    expect(rates([counter(20_000, 5, { temporality: "delta", startMs: 15_000 })])).toEqual([[5, 5_000]]);
    expect(rates([counter(10_000, 3, { temporality: "delta" }), counter(30_000, 4, { temporality: "delta" })])).toEqual([[0, 0], [4, 20_000]]);
  });

  it("gives a point not newer than the stored state its value but no delta", () => {
    const state = { lastMs: 30_000, lastValue: 200, lastHist: null };
    const late = metricPointRow(counter(20_000, 150), state);
    expect(late).toMatchObject({ row: { cnt: 1, vsum: 150, rateDelta: 0, rateMs: 0 }, next: state });
    expect(metricPointRow(counter(30_000, 200), state).row.rateMs).toBe(0);
    expect(metricPointRow(counter(40_000, 250), state).row).toMatchObject({ rateDelta: 50, rateMs: 10_000 });
    expect(metricPointRow(counter(20_000, 7, { temporality: "delta", startMs: 10_000 }), state).row).toMatchObject({ rateDelta: 7, rateMs: 10_000 });
  });

  it("turns cumulative histograms into deltas; a lower count or new bounds start over", () => {
    const rows = metricSeriesRows([hist(0, 10, [5, 5, 0]), hist(10_000, 30, [10, 15, 5]), hist(20_000, 4, [4, 0, 0]), hist(30_000, 6, [1, 2, 3], [2, 20])], null).rows;
    expect(rows.map((r) => r.row.hist && [r.row.hist.count, r.row.hist.counts])).toEqual([null, [20, [5, 10, 5]], [4, [4, 0, 0]], [6, [1, 2, 3]]]);
  });

  it("sums rows per tier bucket, and leaves out tiers that no longer keep the time", () => {
    const now = 100 * 3_600_000;
    const { rows } = metricSeriesRows([counter(now - 5_000, 1), counter(now - 3_000, 4), counter(now - 7 * 3_600_000, 9)], null);
    const tiers = metricTierRows(rows, now).map((t) => [t.tier.name, t.bucket, t.row.cnt]);
    expect(tiers).toEqual([["5m", now - 7 * 3_600_000, 1], ["1h", now - 7 * 3_600_000, 1], ["10s", now - 10_000, 2], ["5m", now - 300_000, 2], ["1h", now - 3_600_000, 2]]);
  });
});

describe("memory rollups through tier buckets", () => {
  it("match the exact rows where tier buckets nest in page buckets", () => {
    for (const range of ["1h", "6h", "30d"] as const) {
      const points = metricScenario(range);
      for (const params of [{}, { metric: "http.server.request.duration", group: "http.route" }, { metric: "http.requests", stat: "p99" }] as Record<string, string>[]) {
        const exact = metricsModelOf(metricDataOf(points, range, METRIC_NOW, params));
        const tiered = metricsModelOf(metricDataOf(points, range, METRIC_NOW, params, { tiers: true }));
        expect(diffClose(tiered, exact), `${range} ${JSON.stringify(params)}`).toEqual([]);
      }
    }
  });
});
