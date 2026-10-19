import type { Sampled } from "../models/input.js";
import { bucketStarts, type TimeRange, type TimeWindow } from "../stats/common.js";
import { fmtMetric, METRIC_AREAS, type MetricArea, metricAreaOf } from "./format.js";
import { metricBucketsOf, METRIC_BUCKETS, METRIC_SPARK_BUCKETS, type MetricData, type MetricSeriesData } from "./from-rollups.js";
import { metricDataOf } from "./memory.js";
import { RUNTIME_METRICS } from "./runtime.js";
import { type Buckets, displayOf, displayUnitOf, type HistogramStat, histStat, lineOf, type MetricDisplay, mergeBuckets } from "./series.js";
import type { MetricKind, MetricPoint } from "./types.js";

const MAX_LINES = 10;
const STATS: readonly HistogramStat[] = ["p50", "p95", "p99", "avg"];

/** In-app hosts compute the metrics page from raw points in the browser, through the same model as hubs and the cloud. */
export interface MetricsInput {
  points: readonly MetricPoint[];
  range: TimeRange;
  now: number;
  /** `metric`, `service`, `group` (an attribute key or "service"), `stat` (p50, p95, p99, avg), `q` (name search), `where` (key=value,...). */
  params: Readonly<Record<string, string>>;
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
  /** The `where` filter in use ("key=value", comma-separated), and the values each key has (at most 50 per key). */
  where: string;
  values: Record<string, string[]>;
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
  /** `sampled` is always null: hosts read rollups, never a capped set of points. It stays for older clients. */
  meta: { range: TimeRange; window: TimeWindow; sampled: Sampled | null; points: number };
  services: string[];
  catalog: MetricInfo[];
  selected: MetricDetail | null;
  runtime: { service: string; stats: RuntimeStat[] }[];
}

type Series = readonly MetricSeriesData[];

function byName(series: Series): Map<string, MetricSeriesData[]> {
  const out = new Map<string, MetricSeriesData[]>();
  for (const s of series) {
    const list = out.get(s.name);
    if (list) list.push(s);
    else out.set(s.name, [s]);
  }
  return out;
}

const lastOf = (values: readonly (number | null)[]): number | null => [...values].reverse().find((v) => v != null) ?? null;
const statOf = (p: Readonly<Record<string, string>>): HistogramStat => (STATS.includes(p.stat as HistogramStat) ? (p.stat as HistogramStat) : "p95");
const ofService = (series: Series, service?: string) => series.filter((s) => !service || s.service === service);

/** Several series as one, over the spark or the line buckets. */
function merged(series: Series, which: "spark" | "line", service?: string): Buckets {
  const n = which === "spark" ? METRIC_SPARK_BUCKETS : METRIC_BUCKETS;
  return mergeBuckets(ofService(series, service).map((s) => metricBucketsOf(displayOf(s), s[which], n)), n);
}

/** The newest value: gauges use their latest points as they are; rates and histograms the newest bucket. */
function lastValue(series: Series, stat: HistogramStat, service?: string): number | null {
  const list = ofService(series, service);
  if (list.length === 0) return null;
  if (displayOf(list[0]!) === "value") return list.reduce((t, s) => t + (s.total.lastV ?? 0), 0) / list.length;
  return lastOf(lineOf(merged(list, "line"), stat));
}

function infoOf(name: string, series: Series, stat: HistogramStat): MetricInfo {
  const latest = series.reduce((a, b) => (b.total.lastMs > a.total.lastMs ? b : a));
  const display = displayOf(latest);
  const displayUnit = displayUnitOf(latest.unit, display);
  const spark = lineOf(merged(series, "spark"), stat);
  const last = lastValue(series, stat);
  const services = [...new Set(series.map((s) => s.service))].sort();
  const base = { name, kind: latest.kind, unit: latest.unit, displayUnit, display, description: latest.description, area: metricAreaOf(name) };
  return { ...base, services, series: series.length, last, lastText: fmtMetric(last, displayUnit), spark };
}

function groupValue(s: MetricSeriesData, groupBy: string): string {
  if (groupBy === "service") return s.service;
  const v = s.attributes[groupBy];
  return v === null || v === undefined ? "(none)" : String(v);
}

function seriesLabel(s: MetricSeriesData, showService: boolean): string {
  const parts = Object.entries(s.attributes).map(([k, v]) => `${k}=${v}`);
  if (showService) parts.unshift(s.service);
  return parts.join(" · ") || s.service;
}

/** The lines of one metric: one per series, or one per value of `groupBy`. The biggest come first. */
function linesOf(series: Series, groupBy: string, stat: HistogramStat): { lines: MetricLine[]; hidden: number } {
  const groups = new Map<string, MetricSeriesData[]>();
  const showService = new Set(series.map((s) => s.service)).size > 1;
  for (const s of series) {
    const label = groupBy ? groupValue(s, groupBy) : seriesLabel(s, showService);
    const list = groups.get(label);
    if (list) list.push(s);
    else groups.set(label, [s]);
  }
  const lines = [...groups].map(([label, list]) => {
    const values = lineOf(merged(list, "line"), stat);
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

function detailOf(name: string, series: Series, w: TimeWindow, p: Readonly<Record<string, string>>): Omit<MetricDetail, "where" | "values"> {
  const stat = statOf(p);
  const services = new Set(series.map((s) => s.service));
  const attrKeys = new Set(series.flatMap((s) => Object.keys(s.attributes)));
  const groupKeys = [...(services.size > 1 ? ["service"] : []), ...[...attrKeys].sort()];
  const groupBy = groupKeys.includes(p.group ?? "") ? p.group! : "";
  const all = merged(series, "line");
  const hist = all.display === "percentiles";
  const seconds = (w.to - w.from) / METRIC_BUCKETS / 1000;
  return {
    ...infoOf(name, series, stat),
    stat,
    groupBy,
    groupKeys,
    buckets: bucketStarts(w, METRIC_BUCKETS),
    ...linesOf(series, groupBy, stat),
    percentiles: hist ? (Object.fromEntries(STATS.map((s) => [s, all.hists.map((h) => histStat(h, s))])) as Record<HistogramStat, (number | null)[]>) : null,
    countRate: hist ? all.hists.map((h) => (h ? h.count / seconds : null)) : null,
    summary: { ...summaryOf(lineOf(all, stat)), last: lastValue(series, stat) },
  };
}

/** Series whose attributes (or "service") match every `key=value` of `where`. */
export function whereFilter(series: Series, where: string | undefined): Series {
  const pairs = (where ?? "").split(",").map((p) => p.split("=")).filter((p) => p.length === 2 && p[0]!.trim()).map(([k, v]) => [k!.trim(), v!.trim()] as const);
  return pairs.length === 0 ? series : series.filter((s) => pairs.every(([k, v]) => groupValue(s, k) === v));
}

/** The values each key of a metric has, to pick a `where` from. */
function valuesOf(series: Series): Record<string, string[]> {
  const out: Record<string, Set<string>> = { service: new Set(series.map((s) => s.service)) };
  for (const s of series) for (const k of Object.keys(s.attributes)) (out[k] ??= new Set()).add(groupValue(s, k));
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort().slice(0, 50)]));
}

function runtimeOf(names: Map<string, MetricSeriesData[]>, services: readonly string[]): MetricsModel["runtime"] {
  return services.flatMap((service) => {
    const stats = RUNTIME_METRICS.flatMap((def) => {
      const name = def.names.find((n) => names.get(n)?.some((s) => s.service === service));
      if (!name) return [];
      const series = names.get(name)!;
      const b = merged(series, "spark", service);
      const unit = displayUnitOf(series[0]!.unit, b.display);
      const spark = lineOf(b, def.stat ?? "p95");
      const last = lastValue(series, def.stat ?? "p95", service);
      return [{ key: def.key, label: def.label, metric: name, unit, last, lastText: fmtMetric(last, unit), spark }];
    });
    return stats.length > 0 ? [{ service, stats }] : [];
  });
}

/** The chosen metric, narrowed by `where`; with no series left, still its name and the values to pick from. */
function selectedOf(name: string, all: Series, d: MetricData): MetricDetail {
  const kept = whereFilter(all, d.params.where);
  const detail = detailOf(name, kept.length ? kept : all, d.window, d.params);
  const empty = kept.length === 0 ? { lines: [], percentiles: null, countRate: null, summary: { last: null, min: null, max: null, avg: null } } : {};
  return { ...detail, ...empty, where: d.params.where ?? "", values: valuesOf(all) };
}

/** The metrics page from rollup data: the list of metrics, the runtime strip per service, and the chosen metric's chart. */
export function metricsModelOf(d: MetricData): MetricsModel {
  const service = d.params.service || "";
  const names = byName(d.series);
  const stat = statOf(d.params);
  const q = (d.params.q ?? "").toLowerCase();
  const catalog = [...names]
    .filter(([name]) => !q || name.toLowerCase().includes(q))
    .map(([name, series]) => infoOf(name, series, stat))
    .sort((a, b) => METRIC_AREAS.indexOf(a.area) - METRIC_AREAS.indexOf(b.area) || a.name.localeCompare(b.name));
  const chosen = d.params.metric && names.get(d.params.metric);
  const points = Math.round(d.series.reduce((t, s) => t + s.total.cnt, 0));
  return {
    meta: { range: d.range, window: d.window, sampled: null, points },
    services: d.services,
    catalog,
    selected: chosen ? selectedOf(d.params.metric!, chosen, d) : null,
    runtime: runtimeOf(names, service ? [service] : d.services),
  };
}

/** The metrics page from raw points (in-app hosts): rollups are built in memory first. */
export const metricsModel = (i: MetricsInput): MetricsModel => metricsModelOf(metricDataOf(i.points, i.range, i.now, i.params));
