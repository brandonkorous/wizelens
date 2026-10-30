import { type Attributes, type HubSender, INFRA_RESOURCE_KEYS, INFRA_SERVICE, type MetricHistogram, type MetricKind, type MetricPoint, sanitizeMetricPoint } from "@wizeworks/lens-core/internal";
import type { HubWrite } from "../store.js";
import { attributesOf, nanosToMs, type OtlpKeyValue, type OtlpResource, resourcePick, senderOf } from "./values.js";

type Num = string | number | undefined;

interface OtlpDataPoint {
  attributes?: OtlpKeyValue[];
  startTimeUnixNano?: Num;
  timeUnixNano?: Num;
  asDouble?: number;
  asInt?: Num;
  count?: Num;
  sum?: number;
  min?: number;
  max?: number;
  bucketCounts?: Num[];
  explicitBounds?: number[];
  scale?: number;
  zeroCount?: Num;
  positive?: { offset?: number; bucketCounts?: Num[] };
  negative?: { offset?: number; bucketCounts?: Num[] };
}

interface OtlpData {
  dataPoints?: OtlpDataPoint[];
  aggregationTemporality?: number | string;
  isMonotonic?: boolean;
}

export interface OtlpMetric {
  name?: string;
  description?: string;
  unit?: string;
  gauge?: OtlpData;
  sum?: OtlpData;
  histogram?: OtlpData;
  exponentialHistogram?: OtlpData;
  summary?: OtlpData;
}

export interface OtlpResourceMetrics {
  resource?: OtlpResource;
  scopeMetrics?: { scope?: { name?: string }; metrics?: OtlpMetric[] }[];
}

const num = (v: Num): number => (v === undefined || v === "" ? 0 : Number(v));
const temporalityOf = (t: number | string | undefined) => (t === 1 || t === "AGGREGATION_TEMPORALITY_DELTA" ? "delta" : "cumulative");

/** An explicit-bucket histogram as sent. Counts that do not fit the bounds keep count and sum only. */
function explicit(dp: OtlpDataPoint): MetricHistogram {
  const bounds = (dp.explicitBounds ?? []).map(Number);
  const counts = (dp.bucketCounts ?? []).map(num);
  const fits = counts.length === bounds.length + 1;
  return { count: num(dp.count), sum: dp.sum ?? 0, min: dp.min ?? null, max: dp.max ?? null, bounds: fits ? bounds : [], counts: fits ? counts : [] };
}

/** An exponential histogram as explicit buckets. Zero and negative values go to the first bucket. */
export function fromExponential(dp: OtlpDataPoint): MetricHistogram {
  // Upper bound of index i is base^(i+1) with base = 2^(2^-scale); computed as one power of 2 to keep it exact.
  const bound = (index: number) => 2 ** (index * 2 ** -(dp.scale ?? 0));
  const offset = dp.positive?.offset ?? 0;
  const positive = (dp.positive?.bucketCounts ?? []).map(num);
  const low = num(dp.zeroCount) + (dp.negative?.bucketCounts ?? []).map(num).reduce((t, c) => t + c, 0);
  const head = { count: num(dp.count), sum: dp.sum ?? 0, min: dp.min ?? null, max: dp.max ?? null };
  if (positive.length === 0) return { ...head, bounds: [], counts: [] };
  const bounds = [bound(offset), ...positive.map((_, i) => bound(offset + i + 1))];
  return { ...head, bounds, counts: [low, ...positive, 0] };
}

/** A summary keeps its count and sum. */
const fromSummary = (dp: OtlpDataPoint): MetricHistogram => ({ count: num(dp.count), sum: dp.sum ?? 0, bounds: [], counts: [] });

interface Shape {
  kind: MetricKind;
  data: OtlpData;
  histogram?: (dp: OtlpDataPoint) => MetricHistogram;
}

function shapeOf(m: OtlpMetric): Shape | null {
  if (m.gauge) return { kind: "gauge", data: m.gauge };
  if (m.sum) return { kind: "sum", data: m.sum };
  if (m.histogram) return { kind: "histogram", data: m.histogram, histogram: explicit };
  if (m.exponentialHistogram) return { kind: "histogram", data: m.exponentialHistogram, histogram: fromExponential };
  if (m.summary) return { kind: "histogram", data: m.summary, histogram: fromSummary };
  return null;
}

/** The points of one OTLP metric, with the resource's host and Kubernetes attributes (`resource`) under their own. Points that fail the core checks are skipped. */
export function pointsOf(m: OtlpMetric, service: string, redactKeys: readonly string[], resource: Attributes = {}): MetricPoint[] {
  const shape = shapeOf(m);
  if (!shape || !m.name) return [];
  const temporality = temporalityOf(shape.data.aggregationTemporality);
  return (shape.data.dataPoints ?? []).flatMap((dp) => {
    const startMs = nanosToMs(dp.startTimeUnixNano);
    const raw = {
      name: m.name,
      kind: shape.kind,
      unit: m.unit ?? "",
      description: m.description,
      attributes: { ...resource, ...attributesOf(dp.attributes) },
      timeMs: nanosToMs(dp.timeUnixNano),
      startMs: startMs || undefined,
      monotonic: shape.data.isMonotonic === true,
      temporality: shape.kind === "gauge" ? undefined : m.summary ? "cumulative" : temporality,
      value: dp.asDouble ?? (dp.asInt !== undefined ? num(dp.asInt) : undefined),
      histogram: shape.histogram?.(dp),
    };
    const p = sanitizeMetricPoint(raw, redactKeys, service);
    return p ? [p] : [];
  });
}

/** The collector's host and pod ride on each point, so its resources join by project and environment; an app's join only when the whole sender matches. */
function joinOf(sender: HubSender): { key: string; sender: HubSender } {
  if (sender.service !== INFRA_SERVICE) return { key: JSON.stringify(sender), sender };
  const { host: _host, k8s: _k8s, ...shared } = sender;
  return { key: JSON.stringify(shared), sender: shared };
}

/** One write per sender: a cluster export holds a resource per pod, and one save each is too slow for the exporter's timeout. */
export function writesFromMetrics(list: readonly OtlpResourceMetrics[], redactKeys: readonly string[]): HubWrite[] {
  const out = new Map<string, HubWrite & { metrics: MetricPoint[] }>();
  for (const rm of list) {
    const { key, sender } = joinOf(senderOf(rm.resource));
    const resource = resourcePick(rm.resource, INFRA_RESOURCE_KEYS);
    const metrics = (rm.scopeMetrics ?? []).flatMap((sm) => (sm.metrics ?? []).flatMap((m) => pointsOf(m, sender.service, redactKeys, resource)));
    const have = out.get(key);
    if (have) for (const p of metrics) have.metrics.push(p);
    else out.set(key, { sender, via: "otlp", spans: [], logs: [], remotes: [], metrics });
  }
  return [...out.values()];
}
