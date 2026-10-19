// Totals and per-bucket aggregates of a filtered list (requests or logs), the same as the memory executor's `aggregateRequests` and `aggregateLogs`.
import type { TimeWindow } from "../../stats/common.js";
import { LOG_LEVELS } from "../../stats/logs.js";
import { type Agg, emptyAgg } from "../agg.js";
import { floorOf, lit, num, type SqlSource, type SqlText } from "./dialect.js";

/** The aggregated columns per table: n, err, sum, and counters c0..c2. */
function columnsOf(q: SqlText, table: "requests" | "logs"): string {
  if (table === "logs") return `COUNT(*) AS n, SUM(CASE WHEN level_rank >= ${lit(LOG_LEVELS.indexOf("error"))} THEN 1 ELSE 0 END) AS err, 0 AS s, 0 AS c0, 0 AS c1, 0 AS c2`;
  const failed = `CASE WHEN ${q.isTrue("failed")} THEN 1 ELSE 0 END`;
  return `COUNT(*) AS n, SUM(${failed}) AS err, SUM(duration_ms) AS s, SUM(db_count) AS c0, SUM(CASE WHEN insights > 0 THEN 1 ELSE 0 END) AS c1, SUM(insights) AS c2`;
}

/** Aggregate the rows `where` picks (built on `q`, whose params it uses) per page bucket. */
export async function aggregateSql(src: SqlSource, q: SqlText, table: "requests" | "logs", where: string, w: TimeWindow, buckets: number): Promise<{ total: Agg; series: Agg[] }> {
  const time = table === "logs" ? "time_ms" : "start_ms";
  const b = floorOf(src.d, `((${time} - ${lit(w.from)}) / ${lit(w.to - w.from)}) * ${lit(buckets)}`);
  const rows = await src.run.all(`SELECT ${b} AS b, ${columnsOf(q, table)} FROM fact_${table} ${where} GROUP BY ${b}`, q.params);
  const blank = () => ({ ...emptyAgg(), firstMs: 0, lastMs: 0, topRank: 0 });
  const total = blank();
  const series = Array.from({ length: buckets }, blank);
  for (const r of rows) {
    const i = Math.min(buckets - 1, Math.max(0, num(r.b)));
    for (const a of [total, series[i]!]) {
      a.n += num(r.n);
      a.err += num(r.err);
      a.sum += num(r.s);
      [num(r.c0), num(r.c1), num(r.c2)].forEach((v, k) => (a.c[k] = a.c[k]! + v));
    }
  }
  return { total, series };
}
