// One ingest batch of metric points to rollup writes: tier rows per series, and each series' new state.
import type { MergedHistogram } from "./series.js";
import { mergeHistogram } from "./series.js";
import { type MetricRow, type MetricState, metricSeriesRows, type MetricTierRow, metricTierRows } from "./rollup.js";
import type { MetricDialect } from "./sql.js";
import type { MetricHistogram, MetricPoint } from "./types.js";

/** A series after the batch: what it is (its newest point) and what it remembers. */
export interface MetricSeriesWrite {
  key: string;
  point: MetricPoint;
  state: MetricState;
}

/** One tier bucket to upsert. `hist` is the whole bucket's histogram once merged with what is stored. */
export interface MetricTierWrite extends MetricTierRow {
  key: string;
  name: string;
  hist: MergedHistogram | null;
}

/** Points by series key (the host's hash of `seriesKeyOf`), keys in order so locks are taken in order. */
export function groupMetricSeries(points: readonly MetricPoint[], keyOf: (p: MetricPoint) => string): Map<string, MetricPoint[]> {
  const map = new Map<string, MetricPoint[]>();
  for (const p of points) {
    const key = keyOf(p);
    const list = map.get(key);
    if (list) list.push(p);
    else map.set(key, [p]);
  }
  return new Map([...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Tier rows and new states for a batch, from the stored states. */
export function metricBatchWrites(groups: ReadonlyMap<string, readonly MetricPoint[]>, states: ReadonlyMap<string, MetricState | null>, now: number) {
  const series: MetricSeriesWrite[] = [];
  const tiers: MetricTierWrite[] = [];
  for (const [key, list] of groups) {
    const { rows, state } = metricSeriesRows(list, states.get(key) ?? null);
    const point = list.reduce((a, b) => (b.timeMs >= a.timeMs ? b : a));
    series.push({ key, point, state: state! });
    for (const t of metricTierRows(rows, now)) tiers.push({ ...t, key, name: point.name, hist: t.row.hist });
  }
  return { series, tiers };
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const json = <T>(v: unknown): T | null => (typeof v === "string" && v ? (JSON.parse(v) as T) : null);

/** A histogram from stored columns; null when there are no counts. */
export function metricHistOfColumns(r: Record<string, unknown>): MergedHistogram | null {
  const count = Number(r.h_count ?? 0);
  if (!(count > 0)) return null;
  const bounds = json<number[]>(r.h_bounds) ?? [];
  return { bounds, counts: json<number[]>(r.h_counts) ?? [], count, sum: Number(r.h_sum ?? 0), min: num(r.h_min), max: num(r.h_max) };
}

/** A stored series state. A row without a value or histogram (a placeholder) has none. */
export function metricStateOfColumns(r: Record<string, unknown>): MetricState | null {
  const lastValue = num(r.last_value);
  const lastHist = json<MetricHistogram>(r.last_hist);
  if (lastValue === null && lastHist === null) return null;
  return { lastMs: Number(r.last_ms), lastValue, lastHist };
}

/** Merge each tier row's histogram with the stored one of its bucket. */
export function mergeStoredHists(tiers: MetricTierWrite[], stored: (t: MetricTierWrite) => MergedHistogram | null): void {
  for (const t of tiers) {
    const old = t.row.hist ? stored(t) : null;
    if (old && t.row.hist) t.hist = mergeHistogram(old, t.row.hist);
  }
}

const bool = (d: MetricDialect, v: boolean) => (d === "sqlite" ? (v ? 1 : 0) : v);

/** Values in METRIC_TIER_COLUMNS order. */
export function metricTierValues(d: MetricDialect, project: string, env: string, t: MetricTierWrite): unknown[] {
  const r: MetricRow = t.row;
  const h = r.hist;
  const hist = h ? [h.count, h.sum, h.min, h.max, JSON.stringify(t.hist!.bounds), JSON.stringify(t.hist!.counts)] : [0, 0, null, null, null, null];
  return [project, env, t.key, t.name, t.bucket, r.cnt, r.vsum, r.vmin, r.vmax, r.firstMs, r.firstV, r.lastMs, r.lastV, r.rateDelta, r.rateMs, ...hist];
}

/** Values in METRIC_SERIES_COLUMNS order. */
export function metricSeriesValues(d: MetricDialect, project: string, env: string, s: MetricSeriesWrite): unknown[] {
  const p = s.point;
  const meta = [p.name, p.service, p.kind, p.unit, p.description ?? "", bool(d, p.monotonic === true), p.temporality ?? "", JSON.stringify(p.attributes)];
  const hist = s.state.lastHist ? JSON.stringify(s.state.lastHist) : null;
  return [project, env, s.key, ...meta, s.state.lastMs, s.state.lastValue, hist];
}

/** MetricPlaceholder series values (Postgres): what the series is, and no state yet. */
export const metricPlaceholderValues = (project: string, env: string, key: string, point: MetricPoint): unknown[] =>
  metricSeriesValues("pg", project, env, { key, point, state: { lastMs: -1, lastValue: null, lastHist: null } });
