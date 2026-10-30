import { constants } from "node:perf_hooks";
import { AggregationType, MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { describe, expect, it } from "vitest";
import { exponentialToExplicit } from "./exponential.js";
import { GcHistogram } from "./gc.js";
import { RuntimeCollector } from "./runtime.js";
import { MetricStore } from "./store.js";
import { createWizeLens } from "../wizelens.js";
import { metricsOf } from "../adapters/registry.js";
import { wizeLensMetricExporter } from "./otel.js";

describe("runtime collector", () => {
  it("samples CPU, memory, heap, and event loop with sane values", async () => {
    const c = new RuntimeCollector({ add: () => {} });
    c.start();
    await new Promise((r) => setTimeout(r, 60));
    let x = 0;
    // Windows counts CPU time in ~16 ms steps, so stay busy long enough to show.
    for (const end = Date.now() + 100; Date.now() < end; ) x += Math.sqrt(x + 1);
    const points = c.sample();
    c.stop();
    const by = (n: string) => points.filter((p) => p.name === n);
    expect(x).toBeGreaterThan(0);
    const cpu = by("process.cpu.utilization")[0]!.value!;
    expect(cpu).toBeGreaterThan(0);
    expect(cpu).toBeLessThanOrEqual(1.5);
    expect(by("process.cpu.time").map((p) => p.attributes["cpu.mode"])).toEqual(["user", "system"]);
    expect(by("process.memory.usage")[0]!.value).toBeGreaterThan(1024 * 1024);
    expect(by("v8js.memory.heap.used")[0]!.value!).toBeLessThan(by("v8js.memory.heap.limit")[0]!.value!);
    expect(by("nodejs.eventloop.utilization")[0]!.value).toBeGreaterThanOrEqual(0);
    expect(by("nodejs.eventloop.delay.p99")[0]!.value).toBeGreaterThanOrEqual(0);
  });

  it("turns GC entries into delta histograms per type", () => {
    const gc = new GcHistogram();
    gc.record({ duration: 4, detail: { kind: constants.NODE_PERFORMANCE_GC_MINOR } });
    gc.record({ duration: 50, detail: { kind: constants.NODE_PERFORMANCE_GC_MINOR } });
    gc.record({ duration: 2000, detail: { kind: constants.NODE_PERFORMANCE_GC_MAJOR } });
    const points = gc.drain(1000, 2000);
    expect(points.map((p) => [p.attributes["v8js.gc.type"], p.histogram!.counts, p.histogram!.count])).toEqual([
      ["minor", [1, 1, 0, 0, 0], 2],
      ["major", [0, 0, 0, 1, 0], 1],
    ]);
    expect(points[0]).toMatchObject({ name: "v8js.gc.duration", unit: "s", temporality: "delta", startMs: 1000, timeMs: 2000 });
    expect(gc.drain(2000, 3000)).toEqual([]);
  });
});

describe("metric store", () => {
  const gauge = (name: string, timeMs: number, attrs: Record<string, unknown> = {}) => ({ name, kind: "gauge", value: 1, timeMs, attributes: attrs });

  it("redacts, names the service, and keeps time order", () => {
    const s = new MetricStore({ service: "api", redactKeys: ["token"], now: () => 10_000 });
    const seen: number[] = [];
    s.subscribe((p) => seen.push(p.length));
    s.add([gauge("a", 9000, { token: "x" }), gauge("a", 8000), { name: "bad" }]);
    expect(s.since().map((p) => [p.timeMs, p.service, p.attributes.token])).toEqual([[8000, "api", undefined], [9000, "api", "[redacted]"]]);
    expect(s.since(8500).length).toBe(1);
    expect(seen).toEqual([2]);
  });

  it("drops old points, extra points, and new series past the cap", () => {
    let now = 0;
    const s = new MetricStore({ service: "api", redactKeys: [], maxAgeMs: 60_000, maxPoints: 100, maxSeries: 2, now: () => now });
    s.add(Array.from({ length: 150 }, (_, i) => gauge("a", i)));
    expect(s.size).toBe(100);
    s.add([gauge("b", 200), gauge("c", 201)]);
    expect([s.seriesCount, s.dropped]).toEqual([2, 1]);
    now = 200_000;
    s.add([gauge("b", 199_000)]);
    expect(s.since().map((p) => p.timeMs)).toEqual([199_000]);
  });
});

describe("OpenTelemetry metric exporter", () => {
  it("keeps counters, up-down counters, histograms, gauges, and exponential histograms", async () => {
    const wl = createWizeLens({ service: "otel-api", storage: "memory", instrumentFetch: false, metricsIntervalMs: 60_000 });
    const reader = new PeriodicExportingMetricReader({ exporter: wizeLensMetricExporter(wl), exportIntervalMillis: 60_000 });
    const views = [{ instrumentName: "exp.duration", aggregation: { type: AggregationType.EXPONENTIAL_HISTOGRAM } }];
    const provider = new MeterProvider({ readers: [reader], views });
    const meter = provider.getMeter("shop");
    meter.createCounter("orders.placed", { unit: "{order}" }).add(3, { region: "eu" });
    meter.createUpDownCounter("cart.open").add(-2);
    meter.createHistogram("checkout.duration", { unit: "s" }).record(0.2);
    meter.createObservableGauge("queue.depth").addCallback((r) => r.observe(7));
    const exp = meter.createHistogram("exp.duration");
    [1, 2, 4, 8].forEach((v) => exp.record(v));
    await reader.forceFlush();
    const points = metricsOf(wl)!.since();
    const by = (n: string) => points.find((p) => p.name === n)!;
    expect(by("orders.placed")).toMatchObject({ kind: "sum", monotonic: true, temporality: "cumulative", unit: "{order}", value: 3, service: "otel-api", attributes: { region: "eu" } });
    expect(by("cart.open")).toMatchObject({ kind: "sum", monotonic: false, value: -2 });
    expect(by("checkout.duration").histogram).toMatchObject({ count: 1, sum: 0.2 });
    expect(by("queue.depth")).toMatchObject({ kind: "gauge", value: 7 });
    const h = by("exp.duration").histogram!;
    expect([h.count, h.counts.reduce((t, c) => t + c, 0), h.counts.length]).toEqual([4, 4, h.bounds.length + 1]);
    await provider.shutdown();
    await wl.shutdown();
  });

  it("converts exponential buckets to explicit ones", () => {
    expect(exponentialToExplicit({ scale: 0, zeroCount: 1, positive: { offset: 1, bucketCounts: [2, 3] }, negative: { bucketCounts: [4] } })).toEqual({
      bounds: [2, 4, 8],
      counts: [5, 2, 3, 0],
    });
    expect(exponentialToExplicit({ scale: 1, zeroCount: 2 })).toEqual({ bounds: [], counts: [2] });
  });
});
