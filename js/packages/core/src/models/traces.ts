import type { Health } from "../health.js";
import { type Agg, avgOfAgg } from "../scale/agg.js";
import type { TraceItem } from "../scale/facts-lists.js";
import type { PageData, PageDef } from "../scale/needs.js";
import { requestOf } from "../stats/requests.js";
import { type Bottleneck, type CriticalSpan, type LayerKind, type TraceCards, traceDurationOf } from "../stats/traces.js";
import type { Trace } from "../types.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
import { insightGroupsOf, insightNeeds } from "./insight-groups.js";
import { avgs, byDesc, counter, counts, groupNeed, listNeed, listOf, type Row, rowsOf, seriesNeed, seriesOf, totalOf, uniqueNeeds } from "./read.js";

const BUCKETS = 24;
const RECENT = 10;
const CRITICAL = 25;
const BOTTLENECKS = 8;

/** One row of the recent traces list. */
export interface TraceListItem {
  traceId: string;
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
  recent: TraceListItem[];
  matching: number;
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
  path: tracePath(t),
  durationMs: traceDurationOf(t),
  health: requestOf(t)?.health ?? null,
  status: t.status,
  services: t.services,
});

const listItemOf = ({ traceId, path, durationMs, health, status, services }: TraceItem): TraceListItem => ({ traceId, path, durationMs, health, status, services });

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
    prev: cardsOf(totalOf(d, "meta.prev"), seriesOf(d, "t.prevSeries", BUCKETS)),
    insights: insightGroupsOf(d, "cur").length,
    prevInsights: hasPrev ? insightGroupsOf(d, "prev").length : null,
    insightSeries: counter(seriesOf(d, "ins.series", BUCKETS), 2),
  };
}

/** The Traces page. Params: q (search), trace (selected id). */
export const tracesPage: PageDef<TracesModel> = {
  needs: (ctx) =>
    uniqueNeeds([
      ...META_NEEDS,
      groupNeed("t.cur", "trace", "cur"),
      seriesNeed("t.series", "trace", "cur", BUCKETS),
      seriesNeed("t.prevSeries", "trace", "prev", BUCKETS),
      ...insightNeeds("cur"),
      ...insightNeeds("prev"),
      seriesNeed("ins.series", "req", "cur", BUCKETS),
      listNeed("recent", "traces", "cur", { filter: { q: ctx.params.q ?? "" }, limit: RECENT, count: true }),
      groupNeed("bn.layer", "bn.layer", "cur", { top: true }),
      groupNeed("bn.owner", "bn.owner", "cur"),
      listNeed("critical", "critical", "cur", { sort: { key: "duration", desc: true }, limit: CRITICAL }),
      { type: "trace", id: "selected", traceId: ctx.params.trace || null, windows: ["cur", "prev"] },
    ]),
  model(d) {
    const recent = listOf<TraceItem>(d, "recent");
    return {
      meta: metaOf(d),
      cards: cards(d),
      recent: recent.items.map(listItemOf),
      matching: recent.total ?? recent.items.length,
      bottlenecks: { layer: bottlenecksOf(rowsOf(d, "bn.layer"), "layer"), service: bottlenecksOf(rowsOf(d, "bn.owner"), "service") },
      critical: listOf<CriticalSpan>(d, "critical").items,
      selected: d.traces.selected ?? null,
    };
  },
};
