// Metric reads as steps of SQL: hosts run each step's queries (sync on the hub, async on the cloud) and get MetricData back.
import { planSeries, planTotals, snapWindow, type Tier } from "../scale/window.js";
import { periodWindow } from "../stats/period.js";
import { type TimeRange, type TimeWindow } from "../stats/common.js";
import {
  addMetricPlaced,
  emptyMetricBuckets,
  METRIC_BUCKETS,
  METRIC_SPARK_BUCKETS,
  type MetricData,
  type MetricSeriesData,
  type MetricPlacement,
  placeMetricBucket,
  type MetricRowBuckets,
} from "./from-rollups.js";
import { metricHistOfColumns } from "./ingest.js";
import type { MetricRow } from "./rollup.js";
import { RUNTIME_METRICS } from "./runtime.js";
import { displayOf } from "./series.js";
import { metricBucketsSql, metricEndsSql, metricHistRowsSql, type MetricDialect, type MetricSqlScope, type MetricSql, metricTotalsSql } from "./sql.js";

export type MetricRows = Record<string, unknown>[];
export type MetricSteps<T> = Generator<MetricSql[], T, MetricRows[]>;

/** Run the steps with a sync query runner (SQLite). */
export function runMetricSync<T>(g: MetricSteps<T>, run: (q: MetricSql) => MetricRows): T {
  let step = g.next([]);
  while (!step.done) step = g.next(step.value.map(run));
  return step.value;
}

/** Run the steps with an async query runner (Postgres). */
export async function runMetricAsync<T>(g: MetricSteps<T>, run: (q: MetricSql) => Promise<MetricRows>): Promise<T> {
  let step = g.next([]);
  while (!step.done) step = g.next(await Promise.all(step.value.map(run)));
  return step.value;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
export const metricSeriesIdOf = (r: Record<string, unknown>): string => `${r.project ?? ""}\u001f${r.env ?? ""}\u001f${r.series_key}`;

/** A row from metric table columns (sums may be missing from histogram reads). */
export function metricRowOfColumns(r: Record<string, unknown>): MetricRow {
  return {
    cnt: Number(r.cnt ?? 0),
    vsum: Number(r.vsum ?? 0),
    vmin: num(r.vmin),
    vmax: num(r.vmax),
    firstMs: num(r.first_ms) ?? Number.POSITIVE_INFINITY,
    firstV: num(r.first_v),
    lastMs: num(r.last_ms) ?? Number.NEGATIVE_INFINITY,
    lastV: num(r.last_v),
    rateDelta: Number(r.rate_delta ?? 0),
    rateMs: Number(r.rate_ms ?? 0),
    hist: metricHistOfColumns(r),
  };
}

/** Series with points in the window, from the totals and ends rows. */
export function metricSeriesOfRows(totals: MetricRows, ends: MetricRows): MetricSeriesData[] {
  const firsts = new Map<string, Record<string, unknown>>();
  const lasts = new Map<string, Record<string, unknown>>();
  for (const e of ends) {
    if (Number(e.rf) === 1) firsts.set(metricSeriesIdOf(e), e);
    if (Number(e.rl) === 1) lasts.set(metricSeriesIdOf(e), e);
  }
  return totals.map((r) => {
    const id = metricSeriesIdOf(r);
    const total = { ...metricRowOfColumns(r), firstV: num(firsts.get(id)?.first_v), lastV: num(lasts.get(id)?.last_v) };
    const s: MetricSeriesData = { id, name: String(r.name), service: String(r.service), kind: r.kind as MetricSeriesData["kind"], unit: String(r.unit), description: String(r.description ?? ""), attributes: JSON.parse(String(r.attributes)), total, spark: null, line: null };
    if (r.kind === "sum") s.monotonic = r.monotonic === true || Number(r.monotonic) === 1;
    if (r.temporality === "delta" || r.temporality === "cumulative") s.temporality = r.temporality;
    return s;
  });
}

/** The names the page reads buckets for: the catalog (search), the runtime strip, and the chosen metric. */
function namesOf(series: readonly MetricSeriesData[], params: Readonly<Record<string, string>>) {
  const q = (params.q ?? "").toLowerCase();
  const runtime = new Set(RUNTIME_METRICS.flatMap((d) => d.names));
  const spark = new Set(series.map((s) => s.name).filter((n) => !q || n.toLowerCase().includes(q) || runtime.has(n) || n === params.metric));
  const line = new Set(series.filter((s) => spark.has(s.name) && (displayOf(s) !== "value" || s.name === params.metric)).map((s) => s.name));
  return { spark, line };
}

interface Want {
  which: "spark" | "line";
  n: number;
  plan: NonNullable<MetricPlacement>;
  names: Set<string>;
}

/** Add grouped rows (`b`) or tier rows (`bucket_ms`) into the buckets `pick` gives for each series. */
export function fillMetricBuckets<S>(byId: ReadonlyMap<string, S>, rows: MetricRows, w: TimeWindow, n: number, plan: NonNullable<MetricPlacement>, pick: (s: S) => MetricRowBuckets | null): void {
  for (const r of rows) {
    const s = byId.get(metricSeriesIdOf(r));
    const into = s === undefined ? null : pick(s);
    if (!into) continue;
    const places = r.b !== undefined && r.b !== null ? [{ index: Math.min(n - 1, Number(r.b)), share: 1 }] : placeMetricBucket(Number(r.bucket_ms), w, n, plan);
    addMetricPlaced(into, metricRowOfColumns(r), places);
  }
}

/** Queries for the wanted buckets: grouped sums for values and rates, tier rows for histograms. */
function bucketQueries(d: MetricDialect, scope: MetricSqlScope, w: TimeWindow, series: readonly MetricSeriesData[], wants: readonly Want[]) {
  const hist = new Set(series.filter((s) => s.kind === "histogram").map((s) => s.name));
  const plain = new Set(series.filter((s) => s.kind !== "histogram").map((s) => s.name));
  const jobs: { q: MetricSql; fill: (rows: MetricRows, byId: Map<string, MetricSeriesData>) => void }[] = [];
  for (const want of wants) {
    const names = [...want.names].filter((n) => plain.has(n));
    const fill = (rows: MetricRows, byId: Map<string, MetricSeriesData>) => fillMetricBuckets(byId, rows, w, want.n, want.plan, (s) => s[want.which]);
    if (names.length) jobs.push({ q: metricBucketsSql(d, { ...scope, names }, w, want.n, want.plan), fill });
  }
  const tiers = new Map<Tier, Want[]>();
  for (const want of wants) tiers.set(want.plan.tier, [...(tiers.get(want.plan.tier) ?? []), want]);
  for (const [tier, list] of tiers) {
    const names = [...new Set(list.flatMap((x) => [...x.names]))].filter((n) => hist.has(n));
    const fill = (rows: MetricRows, byId: Map<string, MetricSeriesData>) => list.forEach((x) => fillMetricBuckets(byId, rows, w, x.n, x.plan, (s) => s[x.which]));
    if (names.length) jobs.push({ q: metricHistRowsSql(d, { ...scope, names }, w, tier), fill });
  }
  return jobs;
}

/** The metrics page data, as SQL steps. `now` is aligned by the host. */
export function* metricPageSteps(d: MetricDialect, scope: MetricSqlScope, range: TimeRange, now: number, params: Readonly<Record<string, string>>): MetricSteps<MetricData> {
  const w = snapWindow(periodWindow(range, now, params), now);
  const segments = planTotals(w, now, Number.POSITIVE_INFINITY);
  const base = { project: scope.project, env: scope.env };
  const [totals, ends] = [metricTotalsSql(d, base, segments), metricEndsSql(d, base, segments)];
  if (!totals || !ends) return { range, window: w, params, services: [], series: [] };
  const [tRows, eRows] = yield [totals, ends];
  const all = metricSeriesOfRows(tRows!, eRows!);
  const service = params.service || "";
  const series = service ? all.filter((s) => s.service === service) : all;
  const names = namesOf(series, params);
  const want = (which: "spark" | "line", n: number): Want => ({ which, n, plan: planSeries(w, n, now, Number.POSITIVE_INFINITY), names: names[which] });
  const wants = [want("spark", METRIC_SPARK_BUCKETS), want("line", METRIC_BUCKETS)];
  for (const s of series) for (const x of wants) if (x.names.has(s.name)) s[x.which] = emptyMetricBuckets(x.n);
  const jobs = bucketQueries(d, { ...base, service: service || undefined }, w, series, wants);
  const rows = jobs.length ? yield jobs.map((j) => j.q) : [];
  const byId = new Map(series.map((s) => [s.id, s]));
  jobs.forEach((j, i) => j.fill(rows[i]!, byId));
  return { range, window: w, params, services: [...new Set(all.map((s) => s.service))].sort(), series };
}
