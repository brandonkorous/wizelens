// The page of one error group: its count over time, where it happens, and its newest occurrences with their users and browsers.
import type { RequestItem, TraceItem } from "../scale/facts-lists.js";
import { joinKey, splitKey } from "../scale/kinds.js";
import type { PageDef } from "../scale/needs.js";
import { bucketStarts } from "../stats/common.js";
import type { ErrorGroup } from "../stats/errors.js";
import { CHART_BUCKETS } from "./database.js";
import { type IssueInfo, issueInfos } from "./error-issues.js";
import { errorGroupOf } from "./errors.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
import { byDesc, counter, counts, groupNeed, listNeed, listOf, rowsOf, type Series, seriesNeed, seriesOf, totalOf, uniqueNeeds } from "./read.js";

/** Occurrences listed: the group keeps its 50 newest trace ids. */
const OCCURRENCES = 50;

export interface ErrorPageModel {
  meta: ModelMeta;
  /** Null when the group did not happen in the range. */
  group: ErrorGroup | null;
  prevCount: number;
  starts: number[];
  chart: { count: Series; critical: Series; prev: Series };
  /** Endpoints where it happened, most first. */
  endpoints: { endpoint: string; count: number }[];
  /** The newest occurrences that were requests (with user and browser), newest first. */
  requests: RequestItem[];
  /** The newest occurrences as traces, for errors outside requests (browser errors). */
  traces: TraceItem[];
  /** Its status, first seen over all time, and assignee. */
  issue: IssueInfo | null;
  /** True when the host keeps issue states. */
  hasIssues: boolean;
}

const keysOf = (group: string) => ({ filter: { keys: [group] } });

/** The Error page. Params: group (the group key). */
export const errorPage: PageDef<ErrorPageModel> = {
  needs: (ctx) => {
    const group = ctx.params.group ?? "";
    return uniqueNeeds([
      ...META_NEEDS,
      groupNeed("g", "err.g", "cur", { top: true, ids: true, ...keysOf(group) }),
      groupNeed("g.prev", "err.g", "prev", keysOf(group)),
      groupNeed("ge", "err.ge", "cur", { filter: { prefix: joinKey(group, "") } }),
      seriesNeed("chart", "err.g", "cur", CHART_BUCKETS, keysOf(group)),
      seriesNeed("chart.prev", "err.g", "prev", CHART_BUCKETS, keysOf(group)),
      groupNeed("life", "err.g", "all", keysOf(group)),
    ]);
  },
  followUp(_ctx, first) {
    const ids = rowsOf(first, "g")[0]?.agg.ids.slice(0, OCCURRENCES) ?? [];
    if (!ids.length) return [];
    return [listNeed("requests", "requests", "cur", { filter: { traceIds: ids }, limit: OCCURRENCES }), listNeed("traces", "traces", "cur", { filter: { traceIds: ids }, limit: OCCURRENCES })];
  },
  model(d) {
    const row = rowsOf(d, "g")[0];
    const ge = [...rowsOf(d, "ge")].sort(byDesc((r) => r.agg.n));
    const chart = seriesOf(d, "chart", CHART_BUCKETS);
    return {
      meta: metaOf(d),
      group: row ? errorGroupOf(row, new Map([[row.key, ge.map((r) => splitKey(r.key)[1]!)]])) : null,
      prevCount: totalOf(d, "g.prev").n,
      starts: bucketStarts(d.window, CHART_BUCKETS),
      chart: { count: counts(chart), critical: counter(chart, 0), prev: counts(seriesOf(d, "chart.prev", CHART_BUCKETS)) },
      endpoints: ge.map((r) => ({ endpoint: splitKey(r.key)[1]!, count: r.agg.n })),
      requests: listOf<RequestItem>(d, "requests").items,
      traces: listOf<TraceItem>(d, "traces").items,
      issue: row ? (issueInfos(d, [row.key])[row.key] ?? null) : null,
      hasIssues: !!d.issues,
    };
  },
};

/** How many of the listed occurrences each value (a user, a browser) had, most first. */
export function countBy<T>(items: readonly T[], value: (t: T) => string | null): { value: string; count: number }[] {
  const out = new Map<string, number>();
  for (const t of items) {
    const v = value(t);
    if (v) out.set(v, (out.get(v) ?? 0) + 1);
  }
  return [...out].map(([v, count]) => ({ value: v, count })).sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1));
}

