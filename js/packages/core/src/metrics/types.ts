import { redactAttributes, toAttributeValue } from "../redact.js";
import type { Attributes } from "../types.js";

/** OpenTelemetry metric shapes WizeLens keeps. A summary is kept as a histogram with no buckets. */
export type MetricKind = "gauge" | "sum" | "histogram";

/** An explicit-bucket histogram. `counts` has one more entry than `bounds` (the last bucket has no upper bound). */
export interface MetricHistogram {
  count: number;
  sum: number;
  min?: number | null;
  max?: number | null;
  bounds: number[];
  counts: number[];
}

/** One metric data point, in OpenTelemetry terms. Gauges and sums have `value`; histograms have `histogram`. */
export interface MetricPoint {
  /** OTel name, for example "process.cpu.utilization" or "http.server.request.duration". */
  name: string;
  kind: MetricKind;
  /** UCUM unit: "1", "By", "s", "ms", "{request}", or "". */
  unit: string;
  description?: string;
  service: string;
  /** Sums only: true for counters (only go up). */
  monotonic?: boolean;
  /** Sums and histograms: "delta" points hold the change since the last point; "cumulative" ones the total since `startMs`. */
  temporality?: "delta" | "cumulative";
  attributes: Attributes;
  timeMs: number;
  startMs?: number;
  value?: number;
  histogram?: MetricHistogram;
}

export const MAX_METRIC_NAME = 200;
const KINDS: readonly MetricKind[] = ["gauge", "sum", "histogram"];
const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** The key of one time series: name, service, and attributes. */
export function seriesKeyOf(p: Pick<MetricPoint, "name" | "service" | "attributes">): string {
  const attrs = Object.keys(p.attributes)
    .sort()
    .map((k) => [k, p.attributes[k]]);
  return `${p.name}\u0000${p.service}\u0000${JSON.stringify(attrs)}`;
}

function histogramOf(raw: unknown): MetricHistogram | null {
  if (!raw || typeof raw !== "object") return null;
  const h = raw as Record<string, unknown>;
  const count = finite(h.count);
  const bounds = Array.isArray(h.bounds) ? h.bounds.map(Number).filter(Number.isFinite) : [];
  const counts = Array.isArray(h.counts) ? h.counts.map(Number).filter(Number.isFinite) : [];
  if (count === null || (counts.length > 0 && counts.length !== bounds.length + 1)) return null;
  return { count, sum: finite(h.sum) ?? 0, min: finite(h.min), max: finite(h.max), bounds, counts };
}

function attributesOf(raw: unknown, redactKeys: readonly string[]): Attributes {
  const out: Attributes = {};
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 32)) out[k.slice(0, 200)] = toAttributeValue(v);
  return redactAttributes(out, redactKeys);
}

/** Check and redact one point from an add-on batch. Returns null when it is not valid. */
export function sanitizeMetricPoint(raw: unknown, redactKeys: readonly string[], service?: string): MetricPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = text(r.name, MAX_METRIC_NAME);
  const kind = KINDS.includes(r.kind as MetricKind) ? (r.kind as MetricKind) : null;
  const timeMs = finite(r.timeMs);
  if (!name || !kind || timeMs === null) return null;
  const value = finite(r.value);
  const histogram = kind === "histogram" ? histogramOf(r.histogram) : null;
  if (kind === "histogram" ? !histogram : value === null) return null;
  const point: MetricPoint = { name, kind, unit: text(r.unit, 50), service: service ?? (text(r.service, 100) || "unknown"), attributes: attributesOf(r.attributes, redactKeys), timeMs };
  const description = text(r.description, 500);
  if (description) point.description = description;
  if (kind === "sum") point.monotonic = r.monotonic === true;
  if (kind !== "gauge") point.temporality = r.temporality === "delta" ? "delta" : "cumulative";
  const startMs = finite(r.startMs);
  if (startMs !== null) point.startMs = startMs;
  if (histogram) point.histogram = histogram;
  else point.value = value!;
  return point;
}
