// Metric points for parity tests: every kind and temporality, counter resets, bound changes, services and attributes.
import type { MetricHistogram, MetricPoint } from "../metrics/types.js";
import { TIME_RANGES, type TimeRange } from "../stats/common.js";

/** On the hour, so tier buckets line up with windows. */
export const METRIC_NOW = Date.UTC(2026, 0, 15, 12);

type Make = (i: number, t: number) => Omit<MetricPoint, "timeMs"> | null;

/** A small deterministic noise in [0, 1). */
const noise = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const gauge = (name: string, unit: string, service: string, attributes: MetricPoint["attributes"], scale: number, salt: number): Make => (i) => ({
  name, kind: "gauge", unit, service, attributes, value: scale * (0.2 + noise(i, salt)),
});

/** A cumulative counter that grows by a noisy step and restarts once at `reset`. */
const counter = (name: string, service: string, attributes: MetricPoint["attributes"], salt: number, reset: number): Make => {
  let total = 0;
  return (i) => {
    total = i === reset ? 5 : total + Math.round(10 + 50 * noise(i, salt));
    return { name, kind: "sum", unit: "{request}", service, attributes, monotonic: true, temporality: "cumulative", value: total };
  };
};

const deltaCounter = (name: string, withStart: boolean, step: number): Make => (i, t) => ({
  name, kind: "sum", unit: "{job}", service: "worker", attributes: {}, monotonic: true, temporality: "delta",
  value: Math.round(1 + 9 * noise(i, 3)), ...(withStart ? { startMs: t - step } : {}),
});

const upDown: Make = (i) => ({ name: "db.client.connection.count", kind: "sum", unit: "{connection}", service: "api", attributes: { state: "used" }, monotonic: false, temporality: "cumulative", value: Math.round(10 * noise(i, 9)) });

/** Bucket counts that add to `count`, mostly in the lower buckets. */
function counts(count: number, buckets: number, salt: number, i: number): number[] {
  const out = new Array<number>(buckets).fill(0);
  for (let k = 0; k < count; k++) out[Math.min(buckets - 1, Math.floor(buckets * noise(i * 31 + k, salt) ** 2))]!++;
  return out;
}

/** A cumulative histogram that restarts at `reset` and switches its bounds at `rebound`. */
const cumulativeHist = (name: string, service: string, attributes: MetricPoint["attributes"], salt: number, reset: number, rebound = -1): Make => {
  let h: MetricHistogram | null = null;
  return (i) => {
    const bounds = rebound >= 0 && i >= rebound ? [0.02, 0.2, 2] : [0.01, 0.1, 1];
    const add = counts(5 + Math.round(20 * noise(i, salt)), 4, salt, i);
    const fresh = !h || i === reset || i === rebound;
    const base: MetricHistogram = fresh ? { count: 0, sum: 0, bounds, counts: [0, 0, 0, 0] } : h!;
    const n = add.reduce((a, b) => a + b, 0);
    h = { count: base.count + n, sum: base.sum + n * 0.05, min: 0.001, max: 3, bounds, counts: base.counts.map((c, k) => c + add[k]!) };
    return { name, kind: "histogram", unit: "s", service, attributes, temporality: "cumulative", histogram: h };
  };
};

const deltaHist = (name: string, empty: boolean): Make => (i) => {
  const c = empty ? [] : counts(3 + Math.round(10 * noise(i, 4)), 4, 4, i);
  const count = empty ? 4 + (i % 3) : c.reduce((a, b) => a + b, 0);
  return { name, kind: "histogram", unit: "s", service: "worker", attributes: {}, temporality: "delta", histogram: { count, sum: count * 0.01, bounds: empty ? [] : [0.001, 0.01, 0.1], counts: c } };
};

function makers(step: number): Make[] {
  return [
    gauge("process.cpu.utilization", "1", "api", { state: "user" }, 0.5, 1),
    gauge("process.cpu.utilization", "1", "api", { state: "system" }, 0.2, 2),
    gauge("process.cpu.utilization", "1", "worker", { state: "user" }, 0.8, 3),
    gauge("process.memory.usage", "By", "api", {}, 1e8, 4),
    gauge("v8js.memory.heap.used", "By", "worker", {}, 5e7, 5),
    upDown,
    counter("http.requests", "api", { route: "/a" }, 6, 40),
    counter("http.requests", "api", { route: "/b" }, 7, -1),
    counter("http.requests", "worker", { route: "/a" }, 8, 90),
    deltaCounter("jobs.done", true, step),
    deltaCounter("queue.pushed", false, step),
    cumulativeHist("http.server.request.duration", "api", { "http.route": "/a" }, 10, 70),
    cumulativeHist("http.server.request.duration", "api", { "http.route": "/b" }, 11, -1),
    cumulativeHist("http.server.request.duration", "worker", { "http.route": "/a" }, 12, -1),
    cumulativeHist("rpc.duration", "worker", {}, 13, -1, 60),
    deltaHist("dotnet.gc.pause.time", false),
    deltaHist("legacy.latency", true),
  ];
}

/** About 150 points per series over the range's window (plus `before` steps ahead of it), 3 s into a 10 s bucket. */
export function metricScenario(range: TimeRange, now = METRIC_NOW, before = 0): MetricPoint[] {
  const ms = TIME_RANGES[range].ms;
  const step = Math.max(10_000, Math.round(ms / 150 / 10_000) * 10_000);
  const list = makers(step);
  const out: MetricPoint[] = [];
  for (let i = 0, t = now - ms - before * step + 3_000; t < now; i++, t += step) {
    list.forEach((make, k) => {
      const p = make(i, t);
      if (p && noise(i * 17 + k, 11) > 0.08) out.push({ ...p, timeMs: t });
    });
  }
  return out;
}

const close = (a: number, b: number) => a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** Paths where two JSON values differ; numbers within 1e-9 relative count as equal. */
export function diffClose(a: unknown, b: unknown, path = "$", out: string[] = []): string[] {
  if (out.length > 20) return out;
  if (typeof a === "number" && typeof b === "number") return close(a, b) ? out : (out.push(`${path}: ${a} vs ${b}`), out);
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b ? out : (out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`), out);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) diffClose((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
  return out;
}
