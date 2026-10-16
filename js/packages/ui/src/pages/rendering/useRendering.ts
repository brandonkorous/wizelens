import { useMemo } from "react";
import {
  avgOf,
  bucketIndex,
  bucketStarts,
  browserTypeOf,
  type ComponentRow,
  componentRows,
  componentStatsOf,
  measured,
  type PageView,
  pageViews,
  percentChange,
  percentileOf,
  type PhaseStat,
  type RouteRow,
  routeRows,
  series,
  type TimeWindow,
  type Trace,
} from "@wizeworks/lens-core";
import { useWindowed } from "../../data/hooks";

export const BUCKETS = 24;

export interface Card {
  value: number | null;
  change: number | null;
  series: (number | null)[];
}

export interface RenderingData {
  views: PageView[];
  routes: RouteRow[];
  components: ComponentRow[];
  hasReact: boolean;
  starts: number[];
  window: TimeWindow;
  compareLabel: string;
  cards: { render: Card; ssr: Card; hydration: Card; issues: Card };
}

/** Average of one field per time bucket. */
function avgSeries(views: readonly PageView[], w: TimeWindow, key: keyof PageView): (number | null)[] {
  const list = views.filter((v) => typeof v[key] === "number");
  return series(list, (v) => v.startMs, w, BUCKETS, "avg", (v) => v[key] as number);
}

/** Average or p75 of render time per bucket. */
export function renderSeries(views: readonly PageView[], w: TimeWindow, stat: PhaseStat): (number | null)[] {
  if (stat === "avg") return avgSeries(views, w, "renderMs");
  const buckets: number[][] = Array.from({ length: BUCKETS }, () => []);
  for (const v of views) {
    const i = bucketIndex(v.startMs, w, BUCKETS);
    if (i >= 0 && v.renderMs !== null) buckets[i]!.push(v.renderMs);
  }
  return buckets.map((b) => percentileOf(b, 75));
}

function metricCard(cur: PageView[], prev: PageView[], w: TimeWindow, key: keyof PageView): Card {
  const value = avgOf(measured(cur, key));
  return { value, change: percentChange(value, avgOf(measured(prev, key))), series: avgSeries(cur, w, key) };
}

/** Renders per bucket of the components that have issues. */
function issueSeries(traces: readonly Trace[], names: Set<string>, w: TimeWindow): number[] {
  const out = new Array<number>(BUCKETS).fill(0);
  for (const t of traces) {
    for (const s of t.spans) {
      const i = browserTypeOf(s) === "react" ? bucketIndex(s.startMs, w, BUCKETS) : -1;
      if (i < 0) continue;
      for (const c of componentStatsOf(s)) if (names.has(c.name)) out[i]! += c.renders;
    }
  }
  return out;
}

function compute(traces: Trace[], prevTraces: Trace[], w: TimeWindow, compareLabel: string): RenderingData {
  const views = pageViews(traces);
  const prevViews = pageViews(prevTraces);
  const components = componentRows(traces, views.length);
  const withIssues = components.filter((c) => c.issues.length > 0);
  const prevIssues = componentRows(prevTraces, prevViews.length).filter((c) => c.issues.length > 0).length;
  const hasPrev = prevTraces.some((t) => t.spans.some((s) => browserTypeOf(s) === "react"));
  return {
    views,
    routes: routeRows(views),
    components,
    hasReact: traces.some((t) => t.spans.some((s) => browserTypeOf(s) === "react")),
    starts: bucketStarts(w, BUCKETS),
    window: w,
    compareLabel,
    cards: {
      render: metricCard(views, prevViews, w, "renderMs"),
      ssr: metricCard(views, prevViews, w, "ssrMs"),
      hydration: metricCard(views, prevViews, w, "hydrationMs"),
      issues: { value: withIssues.length, change: hasPrev ? percentChange(withIssues.length, prevIssues) : null, series: issueSeries(traces, new Set(withIssues.map((c) => c.name)), w) },
    },
  };
}

export function useRendering(): RenderingData & { loading: boolean } {
  const win = useWindowed();
  const data = useMemo(() => compute(win.traces, win.prevTraces, win.window, win.compareLabel), [win.traces, win.prevTraces, win.window, win.compareLabel]);
  return { ...data, loading: win.loading };
}
