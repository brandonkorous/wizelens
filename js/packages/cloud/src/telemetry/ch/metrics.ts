// Metric rollups on ClickHouse: the same series state and tier rows as Postgres, merged by the tables instead of upserts.
import { createHash } from "node:crypto";
import {
  groupMetricSeries, type MergedHistogram, mergeStoredHists, metricBatchWrites, metricHistOfColumns, type MetricPoint, METRIC_SERIES_COLUMNS,
  METRIC_TIER_COLUMNS, metricSeriesValues, metricStateOfColumns, type MetricTierWrite, metricTierValues, seriesKeyOf, TIERS,
} from "@wizeworks/lens-core/internal";
import type { ChClient } from "./http.js";
import { nextVer, rowOf } from "./util.js";

const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");
const cols = (list: readonly string[]) => list.map((c) => (c === "project" ? "project_id" : c));

const TIER_INPUT = [
  "project_id String, org_id String, env String, series_key String, name String, bucket_ms Float64, cnt Float64, vsum Float64, vmin Nullable(Float64)",
  "vmax Nullable(Float64), first_ms Float64, first_v Nullable(Float64), last_ms Float64, last_v Nullable(Float64), rate_delta Float64, rate_ms Float64",
  "h_count Float64, h_sum Float64, h_min Nullable(Float64), h_max Nullable(Float64), h_bounds Nullable(String), h_counts Nullable(String), ver UInt64, expire_ms Float64",
].join(", ");

/** Sums add, extremes keep extremes, first and last follow time, and histogram counts follow the newest write that had some. `org_id` is the table's last column. */
const tierInsert = (table: string) => `${table}_t SELECT project_id, env, series_key, name, bucket_ms, sum(cnt), sum(vsum), min(vmin), max(vmax),
  min(first_ms), argMinState(first_v, first_ms), max(last_ms), argMaxState(last_v, last_ms), sum(rate_delta), sum(rate_ms), sum(h_count), sum(h_sum),
  min(h_min), max(h_max), argMaxState(h_bounds, ver), argMaxState(h_counts, ver), max(expire_ms), any(org_id) FROM input('${TIER_INPUT}')
  GROUP BY project_id, env, series_key, name, bucket_ms`;

/** One project and its organization. */
type Owner = { id: string; org: string };

/** Stored histograms of the buckets this batch adds counts to. */
async function storedHists(ch: ChClient, project: string, env: string, tiers: readonly MetricTierWrite[]) {
  const stored = new Map<string, MergedHistogram | null>();
  for (const tier of TIERS) {
    const mine = tiers.filter((t) => t.tier === tier && t.row.hist);
    if (!mine.length) continue;
    const sql = `SELECT series_key, bucket_ms, h_count, h_sum, h_min, h_max, h_bounds, h_counts FROM metric_${tier.name}
      WHERE project_id = {p1:String} AND env = {p2:String} AND has({p3:Array(String)}, series_key) AND has({p4:Array(Float64)}, bucket_ms) AND h_count > 0`;
    const rows = await ch.query(sql, [project, env, [...new Set(mine.map((t) => t.key))], [...new Set(mine.map((t) => t.bucket))]]);
    for (const r of rows) stored.set(`${tier.name} ${r.series_key} ${Number(r.bucket_ms)}`, metricHistOfColumns(r));
  }
  return (t: MetricTierWrite) => stored.get(`${t.tier.name} ${t.key} ${t.bucket}`) ?? null;
}

async function writeOnce(ch: ChClient, owner: Owner, env: string, points: readonly MetricPoint[], now: number, retentionMs: number): Promise<void> {
  const project = owner.id;
  const groups = groupMetricSeries(points, (p) => sha1(seriesKeyOf(p)));
  const states = await ch.query(
    "SELECT series_key, last_ms, last_value, last_hist FROM metric_series WHERE project_id = {p1:String} AND env = {p2:String} AND has({p3:Array(String)}, series_key)",
    [project, env, [...groups.keys()]],
  );
  const { series, tiers } = metricBatchWrites(groups, new Map(states.map((r) => [String(r.series_key), metricStateOfColumns(r)])), now);
  mergeStoredHists(tiers, await storedHists(ch, project, env, tiers));
  const ver = nextVer(now);
  const tierCols = cols(METRIC_TIER_COLUMNS);
  for (const tier of TIERS) {
    const rows = tiers.filter((t) => t.tier === tier).map((t) => ({ ...rowOf(tierCols, metricTierValues("ch", project, env, t)), org_id: owner.org, ver, expire_ms: t.bucket + retentionMs }));
    await ch.insert(tierInsert(`metric_${tier.name}`), rows);
  }
  const seriesRows = series.map((s) => ({ ...rowOf(cols(METRIC_SERIES_COLUMNS), metricSeriesValues("ch", project, env, s)), org_id: owner.org, ver, expire_ms: s.state.lastMs + retentionMs }));
  await ch.insert("metric_series_t", seriesRows);
}

/** Metric writes one at a time: each reads the series state it then advances. */
export class MetricWriter {
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly ch: ChClient) {}

  write(project: Owner, env: string, points: readonly MetricPoint[], now: number, retentionMs: number): Promise<void> {
    if (!points.length) return Promise.resolve();
    const run = this.chain.then(() => writeOnce(this.ch, project, env, points, now, retentionMs));
    this.chain = run.catch(() => undefined);
    return run;
  }
}
