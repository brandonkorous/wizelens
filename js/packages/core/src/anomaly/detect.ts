// Anomalies: runs of buckets where a service or endpoint is above its normal for one metric.
import type { Agg } from "../scale/agg.js";
import { KEY_SEP } from "../scale/kinds.js";
import type { ServiceKind } from "../stats/services.js";
import { ANOMALY_METRICS, type AnomalyMetric, enoughData, judge, metricValue, overBy, type Verdict } from "./baseline.js";

/** A metric per bucket with its normal and its line, for a chart. Null where there is no value or no baseline. */
export interface AnomalySeries {
  values: (number | null)[];
  normals: (number | null)[];
  uppers: (number | null)[];
}

export interface Anomaly {
  id: string;
  metric: AnomalyMetric;
  /** The Services row (for example "api:orders"). */
  row: string;
  name: string;
  kind: ServiceKind;
  /** The endpoint, query, or call; null for the whole service. */
  endpoint: string | null;
  startMs: number;
  endMs: number;
  /** True while the newest bucket is still above normal. */
  ongoing: boolean;
  /** The bucket furthest over its line. */
  peak: Verdict;
  series: AnomalySeries;
}

/** One key's buckets now, and in each earlier window that has data for it. */
export interface KeyBuckets {
  key: string;
  cur: Agg[];
  samples: Agg[][];
}

export interface DetectContext {
  starts: readonly number[];
  bucketMs: number;
  spreads: number;
  /** Name and kind of a Services row; rows it does not know are skipped. */
  rowInfo(row: string): { name: string; kind: ServiceKind } | null;
}

function seriesOf(metric: AnomalyMetric, cur: readonly Agg[], verdicts: readonly (Verdict | null)[]): AnomalySeries {
  return {
    values: cur.map((a, i) => verdicts[i]?.value ?? metricValue(metric, a)),
    normals: verdicts.map((v) => v?.normal ?? null),
    uppers: verdicts.map((v) => v?.upper ?? null),
  };
}

/** Runs of buckets above normal, as index ranges with their peak. */
function runsOf(verdicts: readonly (Verdict | null)[]): { from: number; to: number; peak: Verdict }[] {
  const out: { from: number; to: number; peak: Verdict }[] = [];
  verdicts.forEach((v, i) => {
    if (!v?.above) return;
    const last = out[out.length - 1];
    if (last && last.to === i - 1) {
      last.to = i;
      if (overBy(v) > overBy(last.peak)) last.peak = v;
    } else out.push({ from: i, to: i, peak: v });
  });
  return out;
}

/** A run is ongoing when it reaches the newest bucket, or the one before while the newest (still filling) has too little data. */
function ongoingRun(to: number, cur: readonly Agg[], metric: AnomalyMetric): boolean {
  const last = cur.length - 1;
  return to === last || (to === last - 1 && !enoughData(metric, cur[last]!));
}

/** The anomalies of one key and metric. */
function keyAnomalies(k: KeyBuckets, metric: AnomalyMetric, c: DetectContext): Anomaly[] {
  const sep = k.key.indexOf(KEY_SEP);
  const row = sep < 0 ? k.key : k.key.slice(0, sep);
  const info = c.rowInfo(row);
  if (!info) return [];
  const verdicts = k.cur.map((a, i) => judge(metric, a, k.samples.map((s) => s[i]!), c.spreads));
  const runs = runsOf(verdicts);
  if (!runs.length) return [];
  const series = seriesOf(metric, k.cur, verdicts);
  const endpoint = sep < 0 ? null : k.key.slice(sep + 1);
  return runs.map((r) => ({
    id: `${metric}|${k.key}|${c.starts[r.from]}`,
    metric,
    row,
    ...info,
    endpoint,
    startMs: c.starts[r.from]!,
    endMs: c.starts[r.to]! + c.bucketMs,
    ongoing: ongoingRun(r.to, k.cur, metric),
    peak: r.peak,
    series,
  }));
}

/** Every anomaly of every key and metric, earliest first. */
export function detectAnomalies(keys: readonly KeyBuckets[], c: DetectContext): Anomaly[] {
  const all = keys.flatMap((k) => ANOMALY_METRICS.flatMap((m) => keyAnomalies(k, m, c)));
  return all.sort((a, b) => a.startMs - b.startMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
