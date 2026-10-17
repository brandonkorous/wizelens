// Request headline cards (total, average, SQL, error rate, with insights) from rollups or list aggregates.
import { type Agg, avgOfAgg } from "../scale/agg.js";
import type { KeyFilter, Need, NeedResults } from "../scale/needs.js";
import { percentChange, percentOf } from "../stats/common.js";
import { type Headline, type RequestHeadlines, SPARK_BUCKETS } from "../stats/overview.js";
import { avgs, counter, counts, groupNeed, type Series, seriesNeed, seriesOf, totalOf } from "./read.js";

/** Kinds that count requests with the `req` counters: c0 SQL queries, c1 requests with insights. */
export type RequestKind = "req" | "req.dim" | "req.svc";

const headline = (value: number | null, previous: number | null, series: Series): Headline => ({ value, previous, change: percentChange(value, previous), series });

const rate = (a: Agg): number | null => (a.n ? percentOf(a.err, a.n) : null);

/** Headlines from the window's total, the previous window's total, and the window's buckets. */
export function headlinesOf(cur: Agg, prev: Agg, buckets: readonly Agg[]): RequestHeadlines {
  const had = prev.n > 0;
  const p = <T>(v: T): T | null => (had ? v : null);
  return {
    total: headline(cur.n, p(prev.n), counts(buckets)),
    avgDuration: headline(avgOfAgg(cur), p(avgOfAgg(prev)), avgs(buckets)),
    sqlQueries: headline(cur.c[0] ?? 0, p(prev.c[0] ?? 0), counter(buckets, 0)),
    errorRate: headline(rate(cur), p(rate(prev)), buckets.map(rate)),
    withInsights: headline(cur.c[1] ?? 0, p(prev.c[1] ?? 0), counter(buckets, 1)),
  };
}

/** Needs for headlines over a request kind: both windows' totals and the window's buckets. */
export function headlineNeeds(prefix: string, kind: RequestKind, filter?: KeyFilter): Need[] {
  const more = filter ? { filter } : {};
  return [groupNeed(`${prefix}.cur`, kind, "cur", more), groupNeed(`${prefix}.prev`, kind, "prev", more), seriesNeed(`${prefix}.series`, kind, "cur", SPARK_BUCKETS, more)];
}

/** Headlines from the answers to `headlineNeeds`. */
export const headlinesFrom = (d: NeedResults, prefix: string): RequestHeadlines =>
  headlinesOf(totalOf(d, `${prefix}.cur`), totalOf(d, `${prefix}.prev`), seriesOf(d, `${prefix}.series`, SPARK_BUCKETS));
