import { describe, expect, it } from "vitest";
import { fmtMetric, metricAreaOf } from "./format.js";
import { metricsModel } from "./model.js";
import { histogramPercentile } from "./series.js";
import { type MetricPoint, sanitizeMetricPoint } from "./types.js";
import { METRIC_NOW, metricScenario } from "../testing/metric-scenario.js";

const NOW = 1_000_000_000_000;
const MIN = 60_000;
const at = (minAgo: number) => NOW - minAgo * MIN;
const point = (p: Partial<MetricPoint> & Pick<MetricPoint, "name" | "kind">): MetricPoint => ({ unit: "", service: "api", attributes: {}, timeMs: at(1), ...p });
const model = (points: MetricPoint[], params: Record<string, string> = {}) => metricsModel({ points, range: "1h", now: NOW, params });

describe("metric values", () => {
  it("averages gauges and shows them in their unit", () => {
    const pts = [10, 9, 8].map((m, i) => point({ name: "process.memory.usage", kind: "gauge", unit: "By", value: (i + 1) * 1024 * 1024, timeMs: at(m) }));
    const m = model(pts, { metric: "process.memory.usage" });
    expect(m.catalog[0]).toMatchObject({ name: "process.memory.usage", area: "runtime", display: "value", lastText: "3.00 MB" });
    expect(m.selected!.summary).toMatchObject({ min: 1048576, max: 3145728 });
    expect(m.runtime).toEqual([{ service: "api", stats: [expect.objectContaining({ key: "memory", lastText: "3.00 MB" })] }]);
  });

  it("turns a cumulative counter into a rate, and survives a restart", () => {
    const values = [100, 160, 220, 10, 70];
    const pts = values.map((v, i) => point({ name: "http.requests", kind: "sum", monotonic: true, temporality: "cumulative", unit: "{request}", value: v, timeMs: at(10 - i) }));
    const d = model(pts, { metric: "http.requests" }).selected!;
    expect(d.display).toBe("rate");
    expect(d.displayUnit).toBe("{request}/s");
    expect(d.lines[0]!.values.filter((v) => v !== null)).toEqual([1, 1, 10 / 60, 1]);
  });

  it("adds delta counters up per second", () => {
    const pts = [1, 2].map((m) => point({ name: "jobs.done", kind: "sum", monotonic: true, temporality: "delta", value: 30, startMs: at(m) - 30_000, timeMs: at(m) }));
    expect(model(pts, { metric: "jobs.done" }).selected!.summary.last).toBe(1);
  });
});

describe("histograms", () => {
  const hist = (count: number, counts: number[], minAgo: number, attributes = {}) =>
    point({ name: "http.server.request.duration", kind: "histogram", unit: "s", temporality: "cumulative", attributes, timeMs: at(minAgo), histogram: { count, sum: count * 0.05, bounds: [0.01, 0.1, 1], counts } });

  it("finds percentiles in bucket counts", () => {
    const h = { bounds: [10, 20], counts: [50, 40, 10], count: 100, sum: 1200, min: 1, max: 30 };
    expect(histogramPercentile(h, 0.5)).toBe(10);
    expect(histogramPercentile(h, 0.95)).toBe(25);
  });

  it("draws p95 from the change between cumulative points, split by an attribute", () => {
    const pts = [hist(10, [5, 5, 0, 0], 5, { route: "/a" }), hist(110, [5, 5, 100, 0], 4, { route: "/a" }), hist(20, [20, 0, 0, 0], 5, { route: "/b" }), hist(40, [40, 0, 0, 0], 4, { route: "/b" })];
    const d = model(pts, { metric: "http.server.request.duration", group: "route" }).selected!;
    expect(d.groupKeys).toEqual(["route"]);
    expect(d.lines.map((l) => l.label)).toEqual(["/a", "/b"]);
    expect(d.lines[0]!.values.find((v) => v !== null)).toBeCloseTo(0.955, 3);
    expect(d.countRate!.find((v) => v !== null)).toBeCloseTo(120 / 60, 5);
    expect(d.percentiles!.p50.find((v) => v !== null)).toBeGreaterThan(0);
  });

  it("names each line by the attributes that differ, not the ones every line shares", () => {
    const same = { "http.request.method": "GET", "server.port": 5302 };
    const a = { ...same, "http.target": "a", "url.path": "a" };
    const b = { ...same, "http.target": "b", "url.path": "b" };
    const pts = [hist(10, [5, 0, 0, 0], 5, a), hist(20, [5, 0, 0, 0], 4, a), hist(10, [9, 0, 0, 0], 5, b), hist(30, [9, 0, 0, 0], 4, b)];
    const d = model(pts, { metric: "http.server.request.duration" }).selected!;
    expect(d.lines.map((l) => l.label).sort()).toEqual(["url.path=a", "url.path=b"]);
  });
});

describe("inputs and format", () => {
  it("checks and redacts add-on points", () => {
    expect(sanitizeMetricPoint({ name: "x", kind: "gauge", value: 1, timeMs: 5, attributes: { password: "p", n: 1 } }, ["password"], "svc")).toEqual({
      name: "x",
      kind: "gauge",
      unit: "",
      service: "svc",
      attributes: { password: "[redacted]", n: 1 },
      timeMs: 5,
      value: 1,
    });
    expect(sanitizeMetricPoint({ name: "x", kind: "histogram", timeMs: 5, histogram: { count: 1, bounds: [1], counts: [1] } }, [])).toBeNull();
    expect(sanitizeMetricPoint({ name: "x", kind: "gauge", timeMs: 5 }, [])).toBeNull();
  });

  it("formats units", () => {
    expect([fmtMetric(0.256, "1"), fmtMetric(1536, "By/s"), fmtMetric(0.0042, "s"), fmtMetric(12, "{request}/s"), fmtMetric(null, "s")]).toEqual(["25.6%", "1.50 KB/s", "4.20 ms", "12.0 request/s", "—"]);
    expect([metricAreaOf("dotnet.gc.collections"), metricAreaOf("kestrel.active_connections"), metricAreaOf("orders.placed")]).toEqual(["runtime", "http", "custom"]);
  });

  it("filters by service and search", () => {
    const pts = [point({ name: "a.one", kind: "gauge", value: 1 }), point({ name: "b.two", kind: "gauge", value: 2, service: "web" })];
    expect(model(pts, { service: "web" }).catalog.map((c) => c.name)).toEqual(["b.two"]);
    expect(model(pts, { q: "ONE" }).catalog.map((c) => c.name)).toEqual(["a.one"]);
    expect(model(pts).services).toEqual(["api", "web"]);
  });
});

describe("metric where filter", () => {
  it("keeps only the series with the attribute value, and lists the values to pick", () => {
    const points = metricScenario("1h");
    const name = "http.requests";
    const all = metricsModel({ points, range: "1h", now: METRIC_NOW, params: { metric: name } }).selected!;
    const key = Object.keys(all.values).find((k) => k !== "service" && all.values[k]!.length > 1)!;
    const value = all.values[key]![0]!;
    const one = metricsModel({ points, range: "1h", now: METRIC_NOW, params: { metric: name, where: `${key}=${value}`, group: key } }).selected!;
    expect(one.where).toBe(`${key}=${value}`);
    expect(one.lines.map((l) => l.label)).toEqual([value]);
    expect(metricsModel({ points, range: "1h", now: METRIC_NOW, params: { metric: name, where: `${key}=nope` } }).selected!.lines).toEqual([]);
  });
});
