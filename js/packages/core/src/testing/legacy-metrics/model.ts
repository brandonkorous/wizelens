// Frozen copy of the metrics page model from before metric rollups, for parity tests. Test-only: excluded from the build.
import type { Sampled } from "../legacy/input.js";
import { SEMCONV_ALIASES } from "../../semconv.js";
import { bucketStarts, type TimeRange, type TimeWindow, windowOf } from "../../stats/common.js";
import type { Attributes } from "../../types.js";
import { fmtMetric, METRIC_AREAS, type MetricArea, metricAreaOf } from "../../metrics/format.js";
import { RUNTIME_METRICS } from "../../metrics/runtime.js";
import { type Buckets, bucketSeries, displayOf, displayUnitOf, type HistogramStat, histStat, lineOf, type MetricDisplay, mergeBuckets } from "./series.js";
import { type MetricKind, type MetricPoint, seriesKeyOf } from "../../metrics/types.js";

export const METRIC_BUCKETS = 60;
export const METRIC_SPARK_BUCKETS = 24;
const MAX_LINES = 10;
const STATS: readonly HistogramStat[] = ["p50", "p95", "p99", "avg"];

/** What the metrics page is computed from. Hosts read the points of the window, newest first, at most a cap. */
export interface MetricsInput {
  points: readonly MetricPoint[];
  range: TimeRange;
  now: number;
  /** `metric`, `service`, `group` (an attribute key or "service"), `stat` (p50, p95, p99, avg), `q` (name search). */
  params: Readonly<Record<string, string>>;
  sampled?: Sampled | null;
}

export interface MetricInfo {
  name: string;
  kind: MetricKind;
  unit: string;
  /** The unit of the drawn value, for example "By/s" for a byte counter. */
  displayUnit: string;
  display: MetricDisplay;
  description: string;
  area: MetricArea;
  services: string[];
  series: number;
  last: number | null;
  lastText: string;
  spark: (number | null)[];
}

export interface MetricLine {
  label: string;
  values: (number | null)[];
}

export interface MetricDetail extends MetricInfo {
  stat: HistogramStat;
  groupBy: string;
  /** What the lines can be split by: attribute keys, and "service" when more than one service sends it. */
  groupKeys: string[];
  buckets: number[];
  lines: MetricLine[];
  /** Lines left out because there were too many. */
  hidden: number;
  /** Histograms: p50, p95, p99, and average of all series together, and how many values per second. */
  percentiles: Record<HistogramStat, (number | null)[]> | null;
  countRate: (number | null)[] | null;
  summary: { last: number | null; min: number | null; max: number | null; avg: number | null };
}

export interface RuntimeStat {
  key: string;
  label: string;
  metric: string;
  unit: string;
  last: number | null;
  lastText: string;
  spark: (number | null)[];
}

export interface MetricsModel {
  meta: { range: TimeRange; window: TimeWindow; sampled: Sampled | null; points: number };
  services: string[];
  catalog: MetricInfo[];
  selected: MetricDetail | null;
  runtime: { service: string; stats: RuntimeStat[] }[];
}

type SeriesMap = Map<string, MetricPoint[]>;

/** Points of the window by metric name, then by series, each sorted by time. */
function groupPoints(points: readonly MetricPoint[], w: TimeWindow): Map<string, SeriesMap> {
  const out = new Map<string, SeriesMap>();
  for (const p of points) {
    if (p.timeMs < w.from || p.timeMs >= w.to) continue;
    const byName = out.get(p.name) ?? new Map<string, MetricPoint[]>();
    out.set(p.name, byName);
    const key = seriesKeyOf(p);
    const list = byName.get(key);
    if (list) list.push(p);
    else byName.set(key, [p]);
  }
  for (const byName of out.values()) for (const list of byName.values()) list.sort((a, b) => a.timeMs - b.timeMs);
  return out;
}

const lastOf = (values: readonly (number | null)[]): number | null => [...values].reverse().find((v) => v != null) ?? null;
const statOf = (p: Readonly<Record<string, string>>): HistogramStat => (STATS.includes(p.stat as HistogramStat) ? (p.stat as HistogramStat) : "p95");

function merged(series: SeriesMap, w: TimeWindow, n: number, service?: string): Buckets {
  const list = [...series.values()].filter((s) => !service || s[0]!.service === service);
  return mergeBuckets(list.map((s) => bucketSeries(s, w, n)), n);
}

/** The newest value: gauges use their latest points as they are; rates and histograms the newest bucket. */
function lastValue(series: SeriesMap, w: TimeWindow, stat: HistogramStat, service?: string): number | null {
  const list = [...series.values()].filter((s) => !service || s[0]!.service === service);
  if (list.length === 0) return null;
  if (displayOf(list[0]![0]!) === "value") return list.reduce((t, s) => t + (s.at(-1)!.value ?? 0), 0) / list.length;
  return lastOf(lineOf(merged(series, w, METRIC_BUCKETS, service), stat));
}

function infoOf(name: string, series: SeriesMap, w: TimeWindow, stat: HistogramStat): MetricInfo {
  const all = [...series.values()];
  const latest = all.map((s) => s.at(-1)!).reduce((a, b) => (b.timeMs > a.timeMs ? b : a));
  const display = displayOf(latest);
  const displayUnit = displayUnitOf(latest.unit, display);
  const spark = lineOf(merged(series, w, METRIC_SPARK_BUCKETS), stat);
  const last = lastValue(series, w, stat);
  const services = [...new Set(all.map((s) => s[0]!.service))].sort();
  const base = { name, kind: latest.kind, unit: latest.unit, displayUnit, display, description: latest.description ?? "", area: metricAreaOf(name) };
  return { ...base, services, series: all.length, last, lastText: fmtMetric(last, displayUnit), spark };
}

function groupValue(p: MetricPoint, groupBy: string): string {
  if (groupBy === "service") return p.service;
  const v = p.attributes[groupBy];
  return v === null || v === undefined ? "(none)" : String(v);
}

// Line names follow the live model: only the attributes that differ between series (persona #179).
function seriesLabel(attrs: Attributes, service: string, showService: boolean, varying: ReadonlySet<string>): string {
  const parts = Object.entries(attrs).filter(([k]) => varying.has(k) && !(SEMCONV_ALIASES[k] && SEMCONV_ALIASES[k]! in attrs)).map(([k, v]) => `${k}=${v}`);
  if (showService) parts.unshift(service);
  return parts.join(" · ") || service;
}

/** The lines of one metric: one per series, or one per value of `groupBy`. The biggest come first. */
function linesOf(series: SeriesMap, w: TimeWindow, groupBy: string, stat: HistogramStat): { lines: MetricLine[]; hidden: number } {
  const groups = new Map<string, MetricPoint[][]>();
  const showService = new Set([...series.values()].map((s) => s[0]!.service)).size > 1;
  const firsts = [...series.values()].map((s) => s[0]!.attributes);
  const varying = new Set([...new Set(firsts.flatMap((a) => Object.keys(a)))].filter((k) => new Set(firsts.map((a) => String(a[k] ?? ""))).size > 1));
  for (const s of series.values()) {
    const label = groupBy ? groupValue(s[0]!, groupBy) : seriesLabel(s[0]!.attributes, s[0]!.service, showService, varying);
    const list = groups.get(label);
    if (list) list.push(s);
    else groups.set(label, [s]);
  }
  const lines = [...groups].map(([label, list]) => {
    const values = lineOf(mergeBuckets(list.map((s) => bucketSeries(s, w, METRIC_BUCKETS)), METRIC_BUCKETS), stat);
    return { label, values, size: values.reduce<number>((t, v) => t + Math.abs(v ?? 0), 0) };
  });
  lines.sort((a, b) => b.size - a.size || a.label.localeCompare(b.label));
  return { lines: lines.slice(0, MAX_LINES).map(({ label, values }) => ({ label, values })), hidden: Math.max(0, lines.length - MAX_LINES) };
}

function summaryOf(values: readonly (number | null)[]): MetricDetail["summary"] {
  const vs = values.filter((v): v is number => v != null);
  if (vs.length === 0) return { last: null, min: null, max: null, avg: null };
  return { last: lastOf(values), min: Math.min(...vs), max: Math.max(...vs), avg: vs.reduce((t, v) => t + v, 0) / vs.length };
}

function detailOf(name: string, series: SeriesMap, w: TimeWindow, p: Readonly<Record<string, string>>): MetricDetail {
  const stat = statOf(p);
  const services = new Set([...series.values()].map((s) => s[0]!.service));
  const attrKeys = new Set([...series.values()].flatMap((s) => Object.keys(s[0]!.attributes)));
  const groupKeys = [...(services.size > 1 ? ["service"] : []), ...[...attrKeys].sort()];
  const groupBy = groupKeys.includes(p.group ?? "") ? p.group! : "";
  const all = merged(series, w, METRIC_BUCKETS);
  const hist = all.display === "percentiles";
  const seconds = (w.to - w.from) / METRIC_BUCKETS / 1000;
  return {
    ...infoOf(name, series, w, stat),
    stat,
    groupBy,
    groupKeys,
    buckets: bucketStarts(w, METRIC_BUCKETS),
    ...linesOf(series, w, groupBy, stat),
    percentiles: hist ? (Object.fromEntries(STATS.map((s) => [s, all.hists.map((h) => histStat(h, s))])) as Record<HistogramStat, (number | null)[]>) : null,
    countRate: hist ? all.hists.map((h) => (h ? h.count / seconds : null)) : null,
    summary: { ...summaryOf(lineOf(all, stat)), last: lastValue(series, w, stat) },
  };
}

function runtimeOf(byName: Map<string, SeriesMap>, services: readonly string[], w: TimeWindow): MetricsModel["runtime"] {
  return services.flatMap((service) => {
    const stats = RUNTIME_METRICS.flatMap((def) => {
      const name = def.names.find((n) => [...(byName.get(n)?.values() ?? [])].some((s) => s[0]!.service === service));
      if (!name) return [];
      const series = byName.get(name)!;
      const b = merged(series, w, METRIC_SPARK_BUCKETS, service);
      const unit = displayUnitOf([...series.values()][0]![0]!.unit, b.display);
      const spark = lineOf(b, def.stat ?? "p95");
      const last = lastValue(series, w, def.stat ?? "p95", service);
      return [{ key: def.key, label: def.label, metric: name, unit, last, lastText: fmtMetric(last, unit), spark }];
    });
    return stats.length > 0 ? [{ service, stats }] : [];
  });
}

/** The metrics page: the list of metrics, the runtime strip per service, and the chosen metric's chart. */
export function metricsModel(i: MetricsInput): MetricsModel {
  const w = windowOf(i.range, i.now);
  const service = i.params.service || "";
  const points = service ? i.points.filter((p) => p.service === service) : i.points;
  const byName = groupPoints(points, w);
  const stat = statOf(i.params);
  const q = (i.params.q ?? "").toLowerCase();
  const catalog = [...byName]
    .filter(([name]) => !q || name.toLowerCase().includes(q))
    .map(([name, series]) => infoOf(name, series, w, stat))
    .sort((a, b) => METRIC_AREAS.indexOf(a.area) - METRIC_AREAS.indexOf(b.area) || a.name.localeCompare(b.name));
  const services = [...new Set(i.points.map((p) => p.service))].sort();
  const chosen = i.params.metric && byName.get(i.params.metric);
  return {
    meta: { range: i.range, window: w, sampled: i.sampled ?? null, points: points.length },
    services,
    catalog,
    selected: chosen ? detailOf(i.params.metric!, chosen, w, i.params) : null,
    runtime: runtimeOf(byName, service ? [service] : services, w),
  };
}
