import { type Attributes, type MetricPoint, toAttributeValue } from "@wizeworks/lens-core";
import { metricsOf } from "../adapters/registry.js";
import type { WizeLens } from "../types.js";
import { exponentialToExplicit, type ExponentialHistogram } from "./exponential.js";

type HrTime = [number, number];
interface SdkPoint {
  startTime?: HrTime;
  endTime?: HrTime;
  attributes?: Record<string, unknown>;
  value?: unknown;
}
interface SdkMetric {
  descriptor?: { name?: string; unit?: string; description?: string };
  dataPointType?: number;
  isMonotonic?: boolean;
  aggregationTemporality?: number;
  dataPoints?: SdkPoint[];
}
/** The `ResourceMetrics` shape of `@opentelemetry/sdk-metrics`. */
export interface SdkResourceMetrics {
  scopeMetrics?: { metrics?: SdkMetric[] }[];
}

// sdk-metrics enums: DataPointType and AggregationTemporality.
const HISTOGRAM = 0;
const EXPONENTIAL = 1;
const SUM = 3;
const DELTA = 0;
const toMs = (t: HrTime | undefined) => (t ? t[0] * 1000 + t[1] / 1e6 : undefined);

function attributesOf(raw: Record<string, unknown> | undefined): Attributes {
  const out: Attributes = {};
  for (const [k, v] of Object.entries(raw ?? {})) out[k] = toAttributeValue(v);
  return out;
}

interface SdkHistogram {
  count?: number;
  sum?: number;
  min?: number;
  max?: number;
  buckets?: { boundaries?: number[]; counts?: number[] };
}

function histogramOf(type: number, v: SdkHistogram & Partial<ExponentialHistogram>): MetricPoint["histogram"] {
  const explicit = type === EXPONENTIAL ? exponentialToExplicit(v as ExponentialHistogram) : { bounds: [...(v.buckets?.boundaries ?? [])], counts: [...(v.buckets?.counts ?? [])] };
  return { count: Number(v.count ?? 0), sum: Number(v.sum ?? 0), min: v.min ?? null, max: v.max ?? null, ...explicit };
}

function pointOf(m: SdkMetric, d: SdkPoint): MetricPoint | null {
  const type = m.dataPointType ?? 2;
  const histogram = type === HISTOGRAM || type === EXPONENTIAL;
  const timeMs = toMs(d.endTime);
  if (timeMs === undefined || (!histogram && typeof d.value !== "number")) return null;
  const p: MetricPoint = { name: m.descriptor?.name ?? "", kind: histogram ? "histogram" : type === SUM ? "sum" : "gauge", unit: m.descriptor?.unit ?? "", service: "", attributes: attributesOf(d.attributes), timeMs };
  if (m.descriptor?.description) p.description = m.descriptor.description;
  if (p.kind === "sum") p.monotonic = !!m.isMonotonic;
  if (p.kind !== "gauge") p.temporality = m.aggregationTemporality === DELTA ? "delta" : "cumulative";
  const startMs = toMs(d.startTime);
  if (startMs !== undefined) p.startMs = startMs;
  if (histogram) p.histogram = histogramOf(type, d.value as SdkHistogram);
  else p.value = d.value as number;
  return p.name ? p : null;
}

/** OpenTelemetry SDK metrics as WizeLens points. */
export function pointsFromSdk(rm: SdkResourceMetrics): MetricPoint[] {
  return (rm.scopeMetrics ?? []).flatMap((sm) => (sm.metrics ?? []).flatMap((m) => (m.dataPoints ?? []).flatMap((d) => pointOf(m, d) ?? [])));
}

/** An OpenTelemetry exporter for app metrics: `new PeriodicExportingMetricReader({ exporter: wizeLensMetricExporter(wizelens) })`. */
export function wizeLensMetricExporter(wizelens: WizeLens) {
  return {
    export(metrics: SdkResourceMetrics, resultCallback: (result: { code: number; error?: Error }) => void): void {
      try {
        metricsOf(wizelens)?.add(pointsFromSdk(metrics));
        resultCallback({ code: 0 });
      } catch (err) {
        resultCallback({ code: 1, error: err instanceof Error ? err : new Error(String(err)) });
      }
    },
    forceFlush: async (): Promise<void> => {},
    shutdown: async (): Promise<void> => {},
  };
}
