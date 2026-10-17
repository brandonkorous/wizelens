// Route and component rows of the Rendering page (and render insights), rebuilt from page view and React rollups.
import { type Agg, avgOfAgg } from "../scale/agg.js";
import { histMax } from "../scale/hist.js";
import { joinKey, splitKey } from "../scale/kinds.js";
import type { Need, NeedResults, WindowRef } from "../scale/needs.js";
import { type ComponentRow, componentImpact, componentIssues, type RouteRow, routeIssues } from "../stats/rendering.js";
import { aggByKey, byDesc, groupNeed, rowsOf, totalOf } from "./read.js";

const ids = (win: WindowRef) => ({ route: `rr.${win}.route`, m: `rr.${win}.m`, large: `rr.${win}.large`, rc: `rc.${win}`, rcRoute: `rc.${win}.route`, views: `pv.${win}` });

/** Needs for route rows: views per route, per-route averages, and large images. */
export function routeNeeds(win: WindowRef): Need[] {
  const id = ids(win);
  return [groupNeed(id.route, "pv.route", win, { top: true }), groupNeed(id.m, "pv.m", win), groupNeed(id.large, "pv.large", win, { hist: true })];
}

/** Needs for component rows: React component totals, their routes, and page views. */
export function componentNeeds(win: WindowRef): Need[] {
  const id = ids(win);
  return [groupNeed(id.rc, "rc", win, { top: true }), groupNeed(id.rcRoute, "rc.route", win), groupNeed(id.views, "pv", win)];
}

/** Page views in a window, from `componentNeeds`. */
export const viewsOf = (d: NeedResults, win: WindowRef): number => totalOf(d, ids(win).views).n;

const traceIdOf = (a: Agg): string => (a.top as { traceId?: string } | null)?.traceId ?? "";

function routeRowOf(route: string, a: Agg, m: Map<string, Agg>, large: Map<string, Agg>): RouteRow {
  const at = (measure: string) => m.get(joinKey(route, measure));
  const avg = (measure: string) => {
    const x = at(measure);
    return x ? avgOfAgg(x) : null;
  };
  const big = large.get(route)?.hist;
  const numbers = {
    avgRenderMs: avg("render"),
    avgSsrMs: avg("ssr"),
    avgLcpMs: avg("lcp"),
    avgCls: avg("cls"),
    largeImages: Math.max(0, Math.round((big && histMax(big)) ?? 0)),
    avgSsrRenderMs: avg("ssrRender"),
  };
  return {
    route,
    views: a.n,
    ...numbers,
    avgHydrationMs: avg("hydration"),
    ...routeIssues(numbers),
    totalRenderMs: at("render")?.sum ?? 0,
    lastSeenMs: a.lastMs,
    exampleTraceId: traceIdOf(a),
  };
}

/** Routes with their averages and issues, busiest first. */
export function routeRowsOf(d: NeedResults, win: WindowRef): RouteRow[] {
  const id = ids(win);
  const m = aggByKey(d, id.m);
  const large = aggByKey(d, id.large);
  return [...rowsOf(d, id.route)].sort(byDesc((r) => r.agg.n)).map((r) => routeRowOf(r.key, r.agg, m, large));
}

function routesByComponent(d: NeedResults, id: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { key } of rowsOf(d, id)) {
    const [name = "", route = ""] = splitKey(key);
    out.set(name, [...(out.get(name) ?? []), route]);
  }
  return out;
}

/** React components, most own render time first, like `componentRows`. */
export function componentRowsOf(d: NeedResults, win: WindowRef): ComponentRow[] {
  const id = ids(win);
  const rows = rowsOf(d, id.rc);
  const routes = routesByComponent(d, id.rcRoute);
  const views = viewsOf(d, win);
  const allMs = rows.reduce((t, r) => t + (r.agg.c[2] ?? 0), 0);
  const list = rows.map(({ key, agg }): ComponentRow => {
    const [renders = 0, actualMs = 0, selfMs = 0, wasted = 0, context = 0] = agg.c;
    return {
      name: key,
      renders,
      avgMs: renders > 0 ? actualMs / renders : 0,
      selfMs,
      totalMs: actualMs,
      wasted,
      context,
      impact: componentImpact(selfMs, allMs),
      issues: componentIssues({ renders, selfMs, wasted, context }, views),
      routes: [...(routes.get(key) ?? [])].sort(),
      lastSeenMs: agg.lastMs,
      exampleTraceId: traceIdOf(agg),
    };
  });
  return list.sort((a, b) => b.selfMs - a.selfMs || b.renders - a.renders || b.lastSeenMs - a.lastSeenMs);
}
