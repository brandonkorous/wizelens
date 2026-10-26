// The log patterns panel: similar lines grouped (numbers and ids masked), with a count, the change against the window before, and a trend.
import type { PatternSample } from "../scale/facts-errors.js";
import { splitKey } from "../scale/kinds.js";
import type { KeyFilter, NeedResults, PageContext, PageDef } from "../scale/needs.js";
import { percentChange } from "../stats/common.js";
import { levelRank, LOG_LEVELS } from "../stats/logs.js";
import { SPARK_BUCKETS } from "../stats/overview.js";
import type { LogLevel } from "../types.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
import { logFilterOf } from "./logs.js";
import { type PageInfo, pagedRows, type SortValue } from "./paged.js";
import { counts, groupNeed, rowsOf, type Series, seriesNeed, sumSeries, uniqueNeeds } from "./read.js";

/** Patterns a page of the panel shows at first (URL key "pat": patpage, patsize, patsort). */
export const PATTERN_PAGE_SIZE = 15;

export interface LogPatternRow {
  /** The pattern id: `?pattern=<id>` filters the Logs page to its lines. */
  id: string;
  pattern: string;
  /** The newest line of the pattern, with its category and trace. */
  sample: string;
  category: string;
  traceId: string;
  count: number;
  /** Percent change against the window before; null when the pattern is new. */
  change: number | null;
  /** Share of the matching lines, 0 to 100. */
  share: number;
  /** The highest level among its lines. */
  level: LogLevel;
  services: string[];
  series: Series;
}

export interface LogPatternsModel {
  meta: ModelMeta;
  /** Distinct patterns that match the filter. */
  total: number;
  /** Lines that match the filter. */
  lines: number;
  /** One page of the patterns, most lines first or in the `patsort` column's order. */
  rows: LogPatternRow[];
  paging: PageInfo;
}

type Parts = { key: string; service: string; level: LogLevel; id: string; n: number };

/** The `log.p` keys of the window that pass the level, service, pattern, and origin filters. */
function matchingKeys(ctx: PageContext, d: NeedResults): Parts[] {
  const f = logFilterOf(ctx.params);
  const min = levelRank(f.minLevel);
  return rowsOf(d, "pat").flatMap((r) => {
    const [service = "", level = "info", id = "", origin = "r"] = splitKey(r.key);
    const rank = levelRank(level as LogLevel);
    const fromOrigin = !f.origin || (f.origin === "outside") === (origin === "o");
    const ok = (f.exact ? rank === min : rank >= min) && (!f.pattern || id === f.pattern) && fromOrigin && r.agg.n > 0;
    return ok ? [{ key: r.key, service, level: level as LogLevel, id, n: r.agg.n }] : [];
  });
}

type Pattern = { id: string; n: number; keys: Parts[]; prev: number };

/** Pattern ids by line count, most first (ties by id), with the keys of each and the lines the window before. */
function topPatterns(parts: readonly Parts[], d: NeedResults): Pattern[] {
  const before = new Map(rowsOf(d, "pat.prev").map((r) => [r.key, r.agg.n]));
  const byId = new Map<string, Pattern>();
  for (const p of parts) {
    const g = byId.get(p.id) ?? { id: p.id, n: 0, keys: [], prev: 0 };
    g.n += p.n;
    g.prev += before.get(p.key) ?? 0;
    g.keys.push(p);
    byId.set(p.id, g);
  }
  return [...byId.values()].sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1));
}

const changeOf = (g: Pattern): number | null => (g.prev > 0 ? percentChange(g.n, g.prev) : null);

/** Columns the panel sorts by (patsort=-change); a new pattern sorts as the largest change. */
const PATTERN_SORTS: Record<string, SortValue<Pattern>> = {
  count: (g) => g.n,
  share: (g) => g.n,
  change: (g) => changeOf(g) ?? Infinity,
};

/** Every matching pattern, and the page the URL asks for. */
function patternsOf(ctx: PageContext, d: NeedResults) {
  const all = topPatterns(matchingKeys(ctx, d), d);
  return { all, ...pagedRows(all, ctx.params, "pat", PATTERN_PAGE_SIZE, PATTERN_SORTS) };
}

const keyFilter = (ctx: PageContext): KeyFilter | undefined => {
  const service = logFilterOf(ctx.params).service;
  return service ? { parts: [service, null, null, null] } : undefined;
};

function rowOf(d: NeedResults, g: Pattern, lines: number): LogPatternRow {
  const keys = g.keys.map((k) => k.key);
  const tops = rowsOf(d, "pat.top").filter((r) => keys.includes(r.key)).sort((a, b) => b.agg.topRank - a.agg.topRank);
  const top = (tops[0]?.agg.top ?? null) as PatternSample | null;
  const level = g.keys.reduce<LogLevel>((m, k) => (levelRank(k.level) > levelRank(m) ? k.level : m), LOG_LEVELS[0]!);
  return {
    id: g.id, pattern: top?.pattern ?? "", sample: top?.message ?? "", category: top?.category ?? "", traceId: top?.traceId ?? "",
    count: g.n, change: changeOf(g), share: lines ? (g.n / lines) * 100 : 0, level,
    services: [...new Set(g.keys.map((k) => k.service))].sort(), series: counts(sumSeries(d, "pat.s", SPARK_BUCKETS, keys)),
  };
}

/** The patterns page. Params: the Logs page filter (level, exact, service, pattern, origin), and patpage, patsize, patsort. Text, category, and trace filters do not apply to patterns. */
export const logPatternsPage: PageDef<LogPatternsModel> = {
  needs: (ctx) => uniqueNeeds([...META_NEEDS, groupNeed("pat", "log.p", "cur", { filter: keyFilter(ctx) }), groupNeed("pat.prev", "log.p", "prev", { filter: keyFilter(ctx) })]),
  followUp(ctx, first) {
    const keys = patternsOf(ctx, first).rows.flatMap((g) => g.keys.map((k) => k.key));
    if (!keys.length) return [];
    return [
      groupNeed("pat.top", "log.p", "cur", { top: true, filter: { keys } }),
      seriesNeed("pat.s", "log.p", "cur", SPARK_BUCKETS, { split: true, filter: { keys } }),
    ];
  },
  model(d) {
    const { all, rows, paging } = patternsOf(d, d);
    const lines = all.reduce((t, g) => t + g.n, 0);
    return { meta: metaOf(d), total: all.length, lines, rows: rows.map((g) => rowOf(d, g, lines)), paging };
  },
};
