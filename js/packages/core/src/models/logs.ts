import { splitKey } from "../scale/kinds.js";
import type { ListFilter, Need, NeedResults, PageContext, PageDef } from "../scale/needs.js";
import { bucketStarts, percentChange } from "../stats/common.js";
import { type LogFilter, LOG_LEVELS, type LogRow } from "../stats/logs.js";
import { SPARK_BUCKETS } from "../stats/overview.js";
import type { LogLevel } from "../types.js";
import { CHART_BUCKETS } from "./database.js";
import { META_NEEDS, type ModelMeta, type ModelParams, metaOf, pageParams, scoped } from "./input.js";
import { aggByKey, counts, groupNeed, listNeed, listOf, rowsOf, type Series, seriesNeed, sumSeries, uniqueNeeds } from "./read.js";

/** Levels shown as one color in the volume chart. */
export const VOLUME_GROUPS: { key: string; label: string; levels: LogLevel[] }[] = [
  { key: "info", label: "Info and below", levels: ["trace", "debug", "info"] },
  { key: "warn", label: "Warnings", levels: ["warn"] },
  { key: "error", label: "Errors", levels: ["error", "critical"] },
];

export interface LogsModel {
  meta: ModelMeta;
  filter: LogFilter;
  /** Every line in the range, before the filter. */
  totalLines: number;
  services: string[];
  rows: LogRow[];
  matching: number;
  page: number;
  pageSize: number;
  starts: number[];
  volume: Record<string, Series>;
  cards: { total: number; warnings: number; errors: number; critical: number };
  change: { total: number | null; warnings: number | null; errors: number | null; critical: number | null };
  sparks: { total: Series; warnings: Series; errors: Series; critical: Series };
}

const isLevel = (v: string | undefined): v is LogLevel => !!v && (LOG_LEVELS as readonly string[]).includes(v);

/** The filter from URL parameters: level (and exact=1 for that level only), service, category, trace, q, pattern, origin (request or outside), and user. */
export const logFilterOf = (p: ModelParams): LogFilter => ({
  minLevel: isLevel(p.level) ? p.level : "trace",
  exact: p.exact === "1" && isLevel(p.level),
  service: p.service ?? "",
  category: p.category ?? "",
  traceId: p.trace ?? "",
  query: p.q ?? "",
  pattern: p.pattern ?? "",
  origin: p.origin === "request" || p.origin === "outside" ? p.origin : "",
  user: p.user?.trim() ?? "",
});

/** The list filter for the logs table (and for log charts and log alerts). */
export const logListFilterOf = (f: LogFilter): ListFilter => ({
  minLevel: f.minLevel,
  ...(f.exact ? { exactLevel: true } : {}),
  ...(f.service ? { logService: f.service } : {}),
  ...(f.category ? { category: f.category } : {}),
  ...(f.traceId ? { traceId: f.traceId } : {}),
  ...(f.query ? { q: f.query } : {}),
  ...(f.pattern ? { pattern: f.pattern } : {}),
  ...(f.origin ? { logOrigin: f.origin } : {}),
});

type Counts = { total: number; warnings: number; errors: number; critical: number };

function countsOf(d: NeedResults, id: string): Counts {
  const by = aggByKey(d, id);
  const n = (l: LogLevel) => by.get(l)?.n ?? 0;
  return { total: LOG_LEVELS.reduce((t, l) => t + n(l), 0), warnings: n("warn"), errors: n("error") + n("critical"), critical: n("critical") };
}

function changeOf(cur: Counts, prev: Counts): LogsModel["change"] {
  const has = prev.total > 0;
  const change = (a: number, b: number) => (has ? percentChange(a, b) : null);
  return { total: change(cur.total, prev.total), warnings: change(cur.warnings, prev.warnings), errors: change(cur.errors, prev.errors), critical: change(cur.critical, prev.critical) };
}

/** The Logs page. Params: the filter (`logFilterOf`), page, size. The cards and charts follow the service. */
/** Requests of one user the Logs page reads lines from. */
const USER_TRACES = 1000;

/** The table's lines: by the filter, and only these traces when a search or a user picked them. */
const rowsNeed = (ctx: PageContext, f: LogFilter, ids: readonly string[] | undefined): Need =>
  listNeed("rows", "logs", "cur", { filter: ids ? { ...logListFilterOf({ ...f, query: ctx.searchIds ? "" : f.query }), traceIds: ids } : logListFilterOf(f), page: pageParams(ctx.params, 30) });

export const logsPage: PageDef<LogsModel> = {
  needs: (ctx) => {
    const f = logFilterOf(ctx.params);
    const one = scoped(f.service || undefined);
    return uniqueNeeds([
      ...META_NEEDS,
      groupNeed("log.cur", "log", "cur", one),
      groupNeed("log.prev", "log", "prev", one),
      groupNeed("log.s", "log.s", "cur"),
      // With a user, the lines wait for the user's requests (the follow-up); else they come now.
      ...(f.user ? [listNeed("user.traces", "requests", "cur", { filter: { user: f.user }, limit: USER_TRACES })] : [rowsNeed(ctx, f, ctx.searchIds)]),
      seriesNeed("volume", "log", "cur", CHART_BUCKETS, { split: true, ...one }),
      seriesNeed("sparks", "log", "cur", SPARK_BUCKETS, { split: true, ...one }),
    ]);
  },
  followUp(ctx, first) {
    const f = logFilterOf(ctx.params);
    if (!f.user) return [];
    const mine = listOf<{ traceId: string }>(first, "user.traces").items.map((r) => r.traceId);
    return [rowsNeed(ctx, f, ctx.searchIds ? mine.filter((id) => ctx.searchIds!.includes(id)) : mine)];
  },
  model(d) {
    const cards = countsOf(d, "log.cur");
    const list = listOf<LogRow>(d, "rows");
    const spark = (levels: readonly LogLevel[]) => counts(sumSeries(d, "sparks", SPARK_BUCKETS, levels));
    return {
      meta: metaOf(d),
      filter: logFilterOf(d.params),
      totalLines: cards.total,
      services: [...new Set(rowsOf(d, "log.s").map((r) => splitKey(r.key)[0]!))].sort(),
      rows: list.items,
      matching: list.total ?? list.items.length,
      page: list.page,
      pageSize: list.pageSize,
      starts: bucketStarts(d.window, CHART_BUCKETS),
      volume: Object.fromEntries(VOLUME_GROUPS.map((g) => [g.key, counts(sumSeries(d, "volume", CHART_BUCKETS, g.levels))])),
      cards,
      change: changeOf(cards, countsOf(d, "log.prev")),
      sparks: { total: spark(LOG_LEVELS), warnings: spark(["warn"]), errors: spark(["error", "critical"]), critical: spark(["critical"]) },
    };
  },
};
