import { browserTypeOf } from "../../attributes.js";
import { avgOf, bucketIndex, bucketStarts, percentChange, percentileOf, series, type TimeWindow } from "../../stats/common.js";
import { type ComponentRow, componentRows, componentStatsOf } from "../../stats/rendering-components.js";
import { measured, type PageView, pageViews, type PhaseStat, type RenderPhase, renderPhases, type RouteRow, routeRows } from "../../stats/rendering.js";
import type { Trace } from "../../types.js";
import { MODEL_LIST_MAX } from "./database.js";
import { type ModelInput, type ModelMeta, metaOf } from "./input.js";

export const RENDER_BUCKETS = 24;

type Series = (number | null)[];

export interface RenderCard {
  value: number | null;
  change: number | null;
  series: Series;
}

export interface RenderingModel {
  meta: ModelMeta;
  views: number;
  routes: RouteRow[];
  components: ComponentRow[];
  componentCount: number;
  hasReact: boolean;
  starts: number[];
  chart: { avg: Series; p75: Series; views: Series };
  phases: Record<PhaseStat, RenderPhase[]>;
  cards: { render: RenderCard; ssr: RenderCard; hydration: RenderCard; issues: RenderCard };
}

function avgSeries(views: readonly PageView[], w: TimeWindow, key: keyof PageView): Series {
  const list = views.filter((v) => typeof v[key] === "number");
  return series(list, (v) => v.startMs, w, RENDER_BUCKETS, "avg", (v) => v[key] as number);
}

function p75Series(views: readonly PageView[], w: TimeWindow): Series {
  const buckets: number[][] = Array.from({ length: RENDER_BUCKETS }, () => []);
  for (const v of views) {
    const i = bucketIndex(v.startMs, w, RENDER_BUCKETS);
    if (i >= 0 && v.renderMs !== null) buckets[i]!.push(v.renderMs);
  }
  return buckets.map((b) => percentileOf(b, 75));
}

function metricCard(cur: PageView[], prev: PageView[], w: TimeWindow, key: keyof PageView): RenderCard {
  const value = avgOf(measured(cur, key));
  return { value, change: percentChange(value, avgOf(measured(prev, key))), series: avgSeries(cur, w, key) };
}

/** Renders per bucket of the components that have issues. */
function issueSeries(traces: readonly Trace[], names: Set<string>, w: TimeWindow): number[] {
  const out = new Array<number>(RENDER_BUCKETS).fill(0);
  for (const t of traces) {
    for (const s of t.spans) {
      const i = browserTypeOf(s) === "react" ? bucketIndex(s.startMs, w, RENDER_BUCKETS) : -1;
      if (i < 0) continue;
      for (const c of componentStatsOf(s)) if (names.has(c.name)) out[i]! += c.renders;
    }
  }
  return out;
}

const hasReactSpans = (traces: readonly Trace[]) => traces.some((t) => t.spans.some((s) => browserTypeOf(s) === "react"));

/** The Rendering page. */
export function renderingModel(i: ModelInput): RenderingModel {
  const views = pageViews(i.traces);
  const prevViews = pageViews(i.prevTraces);
  const components = componentRows(i.traces, views.length);
  const withIssues = components.filter((c) => c.issues.length > 0);
  const prevIssues = componentRows(i.prevTraces, prevViews.length).filter((c) => c.issues.length > 0).length;
  const w = i.window;
  return {
    meta: metaOf(i),
    views: views.length,
    routes: routeRows(views).slice(0, MODEL_LIST_MAX),
    components: components.slice(0, MODEL_LIST_MAX),
    componentCount: components.length,
    hasReact: hasReactSpans(i.traces),
    starts: bucketStarts(w, RENDER_BUCKETS),
    chart: { avg: avgSeries(views, w, "renderMs"), p75: p75Series(views, w), views: series(views, (v) => v.startMs, w, RENDER_BUCKETS) },
    phases: { avg: renderPhases(views, "avg"), p75: renderPhases(views, "p75") },
    cards: {
      render: metricCard(views, prevViews, w, "renderMs"),
      ssr: metricCard(views, prevViews, w, "ssrMs"),
      hydration: metricCard(views, prevViews, w, "hydrationMs"),
      issues: { value: withIssues.length, change: hasReactSpans(i.prevTraces) ? percentChange(withIssues.length, prevIssues) : null, series: issueSeries(i.traces, new Set(withIssues.map((c) => c.name)), w) },
    },
  };
}
