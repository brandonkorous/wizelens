import { createHash } from "node:crypto";
import {
  groupMetricSeries,
  type MergedHistogram,
  mergeStoredHists,
  metricBatchWrites,
  metricHistOfColumns,
  metricHistStateSql,
  metricPlaceholderValues,
  type MetricPoint,
  metricSeriesInsertSql,
  metricSeriesUpsertSql,
  metricSeriesValues,
  metricStateOfColumns,
  tierCutoff,
  metricStateSql,
  type MetricTierWrite,
  metricTierUpsertSql,
  metricTierValues,
  seriesKeyOf,
  TIERS,
} from "@wizeworks/lens-core";
import type { Queryable } from "../db/db.js";

// Metric rollups at ingest (docs/CONTRACT.md, "Cloud storage"): written with the raw points, in the same transaction.
const CHUNK = 200;
const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");

/** The metric rollup tables, for clearing a project. */
export const METRIC_TABLES = ["metric_series", ...TIERS.map((t) => `metric_${t.name}`)];

/** Multi-row statements, `CHUNK` rows each; `sqlOf(n)` gives the text for n rows. */
async function insertRows(q: Queryable, sqlOf: (n: number) => string, rows: unknown[][]): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    await q.query(sqlOf(part.length), part.flat());
  }
}

/** The stored histograms of the tier buckets this batch adds counts to, locked until the transaction ends. */
async function storedHists(q: Queryable, projectId: string, env: string, tiers: readonly MetricTierWrite[]) {
  const stored = new Map<string, MergedHistogram | null>();
  for (const tier of TIERS) {
    const mine = tiers.filter((t) => t.tier === tier && t.row.hist);
    if (mine.length === 0) continue;
    const s = metricHistStateSql("pg", tier, projectId, env, [...new Set(mine.map((t) => t.key))], [...new Set(mine.map((t) => t.bucket))]);
    for (const r of await q.query(s.sql, s.args)) stored.set(`${tier.name} ${r.series_key} ${Number(r.bucket_ms)}`, metricHistOfColumns(r));
  }
  return (t: MetricTierWrite) => stored.get(`${t.tier.name} ${t.key} ${t.bucket}`) ?? null;
}

/** Add one batch's points to the metric tiers and series state. Series rows are locked first, in key order. */
export async function writeMetricRollups(q: Queryable, projectId: string, env: string, points: readonly MetricPoint[], now: number): Promise<void> {
  if (points.length === 0) return;
  const groups = groupMetricSeries(points, (p) => sha1(seriesKeyOf(p)));
  const keys = [...groups.keys()];
  await insertRows(q, (n) => metricSeriesInsertSql("pg", n), keys.map((k) => metricPlaceholderValues(projectId, env, k, groups.get(k)!.at(-1)!)));
  const st = metricStateSql("pg", projectId, env, keys);
  const states = new Map((await q.query(st.sql, st.args)).map((r) => [String(r.series_key), metricStateOfColumns(r)]));
  const { series, tiers } = metricBatchWrites(groups, states, now);
  mergeStoredHists(tiers, await storedHists(q, projectId, env, tiers));
  for (const tier of TIERS) {
    const rows = tiers.filter((t) => t.tier === tier).map((t) => metricTierValues("pg", projectId, env, t));
    await insertRows(q, (n) => metricTierUpsertSql("pg", tier, n), rows);
  }
  await insertRows(q, (n) => metricSeriesUpsertSql("pg", n), series.map((s) => metricSeriesValues("pg", projectId, env, s)));
}

/** Drop tier buckets past their keep (10 s and 5 min tiers) or the organization's retention (1 h tier and series state). */
export async function pruneMetricRollups(q: Queryable, now: number): Promise<void> {
  for (const t of TIERS.filter((x) => x.keepMs !== null)) await q.query(`DELETE FROM metric_${t.name} WHERE bucket_ms <= $1`, [tierCutoff(t, now, t.keepMs!)]);
  const scope = "USING projects p, orgs o WHERE p.id = m.project_id AND o.id = p.org_id";
  await q.query(`DELETE FROM metric_1h m ${scope} AND m.bucket_ms <= $1 - o.retention_days * 86400000.0`, [now - 3_600_000]);
  await q.query(`DELETE FROM metric_series m ${scope} AND m.last_ms < $1 - o.retention_days * 86400000.0`, [now]);
}
