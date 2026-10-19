import type { Health } from "../health.js";
import { type Agg, avgOfAgg } from "../scale/agg.js";
import type { TraceItem } from "../scale/facts-lists.js";
import type { PageData, PageDef, TraceNeed } from "../scale/needs.js";
import { requestOf } from "../stats/requests.js";
import { type Bottleneck, type CriticalSpan, type LayerKind, type TraceCards, traceDurationOf } from "../stats/traces.js";
import type { Trace } from "../types.js";
import { rawService } from "../stats/errors.js";
import { META_NEEDS, type ModelMeta, metaOf, pageParams, scoped } from "./input.js";
import { type TraceFilter, traceFilterOf, traceListFilter } from "./trace-filter.js";
import { insightGroupsOf, insightNeeds } from "./insight-groups.js";
import { avgs, byDesc, counter, counts, groupNeed, listNeed, listOf, type Row, rowsOf, seriesNeed, seriesOf, totalOf, uniqueNeeds } from "./read.js";

const BUCKETS = 24;
const RECENT = 15;
const CRITICAL = 25;
const BOTTLENECKS = 8;

/** One row of the recent traces list. */
export interface TraceListItem {
  traceId: string;
  /** When the trace began, so a row can be matched against tag rules (tags/match.ts). */
  startMs: number;
  path: string;
  durationMs: number;
  /** Request health when the trace is a request; else null, and `status` decides the color. */
  health: Health | null;
  status: Trace["status"];
  services: string[];
}

export interface TracesModel {
  meta: ModelMeta;
  cards: { cur: TraceCards; prev: TraceCards; insights: number; prevInsights: number | null; insightSeries: (number | null)[] };
  /** One page of the traces that match the filter. */
  recent: TraceListItem[];
  /** Traces that match the filter, on every page. */
  matching: number;
  filter: TraceFilter;
  page: number;
  size: number;
  bottlenecks: { layer: Bottleneck[]; service: Bottleneck[] };
  critical: CriticalSpan[];
  /** The `trace` parameter's trace, else the newest one. */
  selected: Trace | null;
}

/** The path of a trace's root URL, or its name. */
export function tracePath(t: Pick<Trace, "rootUrl" | "rootName">): string {
  const url = t.rootUrl ?? t.rootName;
  if (!/^https?:\/\//.test(url)) return url;
  const u = new URL(url);
  return u.pathname + u.search;
}

export const traceListItem = (t: Trace): TraceListItem => ({
  traceId: t.traceId,
  startMs: t.startMs,
  path: tracePath(t),
  durationMs: traceDurationOf(t),
  health: requestOf(t)?.health ?? null,
  status: t.status,
  services: t.services,
});

const listItemOf = ({ traceId, startMs, path, durationMs, health, status, services }: TraceItem): TraceListItem => ({ traceId, startMs, path, durationMs, health, status, services });

function cardsOf(total: Agg, s: readonly Agg[]): TraceCards {
  return { count: total.n, avgSpans: avgOfAgg(total), slow: total.c[0] ?? 0, series: { count: counts(s), avgSpans: avgs(s), slow: counter(s, 0) } };
}

/** Share of time per layer or per owning service, the largest first. */
function bottlenecksOf(rows: readonly Row[], by: "layer" | "service"): Bottleneck[] {
  const total = rows.reduce((t, r) => t + r.agg.sum, 0);
  return [...rows].sort(byDesc((r) => r.agg.sum)).slice(0, BOTTLENECKS).map(({ key, agg }) => {
    const top = agg.top as { label: string; kind: LayerKind } | null;
    const share = total ? (agg.sum / total) * 100 : 0;
    return { key, label: by === "layer" ? (top?.label ?? key) : key, kind: by === "layer" ? (top?.kind ?? "service") : "owner", totalMs: agg.sum, share };
  });
}

function cards(d: PageData): TracesModel["cards"] {
  const hasPrev = totalOf(d, "meta.prev").n > 0;
  return {
    cur: cardsOf(totalOf(d, "t.cur"), seriesOf(d, "t.series", BUCKETS)),
    prev: cardsOf(totalOf(d, "t.prev"), seriesOf(d, "t.prevSeries", BUCKETS)),
    insights: insightGroupsOf(d, "cur").length,
    prevInsights: hasPrev ? insightGroupsOf(d, "prev").length : null,
    insightSeries: counter(seriesOf(d, "ins.series", BUCKETS), 2),
  };
}

const selectedNeed = (traceId: string | null): TraceNeed => ({ type: "trace", id: "selected", traceId, windows: ["cur", "prev"] });

/** The Traces page. Params: the filter (`traceFilterOf`), page, size, and trace (the selected id). */
export const tracesPage: PageDef<TracesModel> = {
  needs: (ctx) => {
    const f = ctx.searchIds ? { ...traceFilterOf(ctx.params), q: "" } : traceFilterOf(ctx.params);
    const service = f.service || undefined;
    const one = scoped(service);
    return uniqueNeeds([
      ...META_NEEDS,
      groupNeed("t.cur", "trace", "cur", one),
      groupNeed("t.prev", "trace", "prev", one),
      seriesNeed("t.series", "trace", "cur", BUCKETS, one),
      seriesNeed("t.prevSeries", "trace", "prev", BUCKETS, one),
      ...insightNeeds("cur", "all", service),
      ...insightNeeds("prev", "all", service),
      seriesNeed("ins.series", "req", "cur", BUCKETS, one),
      listNeed("recent", "traces", "cur", { filter: { ...traceListFilter(f), ...(ctx.searchIds ? { traceIds: ctx.searchIds } : {}) }, sort: { key: f.sort, desc: true }, page: pageParams(ctx.params, RECENT) }),
      groupNeed("bn.layer", "bn.layer", "cur", { top: true, ...one }),
      groupNeed("bn.owner", "bn.owner", "cur", one),
      listNeed("critical", "critical", "cur", { filter: service ? { service: rawService(service) } : {}, sort: { key: "duration", desc: true }, limit: CRITICAL }),
      ...(ctx.params.trace ? [selectedNeed(ctx.params.trace)] : []),
    ]);
  },
  // Without a chosen trace, the first one of the list (as filtered) shows; with no list, the newest.
  followUp: (ctx, first) => (ctx.params.trace ? [] : [selectedNeed(listOf<TraceItem>(first, "recent").items[0]?.traceId ?? null)]),
  model(d) {
    const recent = listOf<TraceItem>(d, "recent");
    return {
      meta: metaOf(d),
      cards: cards(d),
      recent: recent.items.map(listItemOf),
      matching: recent.total ?? recent.items.length,
      filter: traceFilterOf(d.params),
      page: recent.page,
      size: recent.pageSize,
      bottlenecks: { layer: bottlenecksOf(rowsOf(d, "bn.layer"), "layer"), service: bottlenecksOf(rowsOf(d, "bn.owner"), "service") },
      critical: listOf<CriticalSpan>(d, "critical").items,
      selected: d.traces.selected ?? null,
    };
  },
};
