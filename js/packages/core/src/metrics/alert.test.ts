import { describe, expect, it } from "vitest";
import { metricAlertMessage, metricAlertUnit, metricAlertValue } from "./alert.js";
import type { MetricPoint } from "./types.js";

const W = { from: 0, to: 600_000 };
const at = (timeMs: number, p: Partial<MetricPoint>): MetricPoint => ({ name: "m", kind: "gauge", unit: "1", service: "api", attributes: {}, timeMs, ...p });

describe("metric alert values", () => {
  it("reads gauges: newest, average, highest, and percentiles", () => {
    const pts = [0.2, 0.9, 0.4].map((v, i) => at(i * 100_000, { value: v }));
    expect([metricAlertValue(pts, W, "last"), metricAlertValue(pts, W, "max"), metricAlertValue(pts, W, "p99")]).toEqual([0.4, 0.9, 0.9]);
    expect(metricAlertValue(pts, W, "avg")).toBeCloseTo(0.5, 6);
    expect(metricAlertValue([], W, "avg")).toBeNull();
  });

  it("reads counters as a rate, and histograms as percentiles and values per second", () => {
    const counter = [0, 60, 120].map((v, i) => at(i * 60_000, { kind: "sum", monotonic: true, temporality: "cumulative", value: v }));
    expect(metricAlertValue(counter, W, "rate")).toBe(1);
    const hist = at(60_000, { kind: "histogram", unit: "s", temporality: "delta", histogram: { count: 600, sum: 60, bounds: [0.1, 1], counts: [500, 100, 0] } });
    expect(metricAlertValue([hist], W, "rate")).toBe(1);
    expect(metricAlertValue([hist], W, "avg")).toBeCloseTo(0.1, 6);
    expect(metricAlertUnit(hist, "p95")).toBe("s");
    expect(metricAlertUnit(hist, "rate")).toBe("/s");
  });

  it("says what happened in the metric's unit", () => {
    expect(metricAlertMessage("http.server.request.duration", "p95", ">", 0.42, 0.3, "s")).toBe("http.server.request.duration p95 is 420 ms (above 300 ms)");
  });
});
