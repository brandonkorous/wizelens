// Rendering facts: page views (pv*) by route and by phase, and React components (react, rc*).
import { ATTR_BROWSER_ROUTE, browserTypeOf } from "../attributes.js";
import { withoutBotBrowser } from "../bots.js";
import { componentStatsOf } from "../stats/rendering-components.js";
import { type PageView, pageViewOf } from "../stats/rendering.js";
import type { Span, Trace } from "../types.js";
import { type Contribution, contribution } from "./agg.js";
import { joinKey } from "./kinds.js";

/** Per-route averages (`pv.m` keys `route␟measure`). "ssrRender" is the render time of views that measured SSR. */
export const ROUTE_MEASURES = ["render", "ssr", "hydration", "lcp", "cls", "ssrRender"] as const;
export type RouteMeasure = (typeof ROUTE_MEASURES)[number];

/** Page-wide phases (`pv.g` keys), with a histogram each. */
export const PAGE_PHASES = ["render", "ssr", "client", "hydration", "image", "cls"] as const;
export type PagePhase = (typeof PAGE_PHASES)[number];

const ROUTE_VALUE: Record<RouteMeasure, (v: PageView) => number | null> = {
  render: (v) => v.renderMs,
  ssr: (v) => v.ssrMs,
  hydration: (v) => v.hydrationMs,
  lcp: (v) => v.lcpMs,
  cls: (v) => v.cls,
  ssrRender: (v) => (v.ssrMs === null ? null : v.renderMs),
};

const PHASE_VALUE: Record<PagePhase, (v: PageView) => number | null> = {
  render: (v) => v.renderMs,
  ssr: (v) => v.ssrMs,
  client: (v) => v.clientRenderMs,
  hydration: (v) => v.hydrationMs,
  image: (v) => v.imageMs,
  cls: (v) => v.cls,
};

function viewContributions(v: PageView): Contribution[] {
  const at = v.startMs;
  const out = [contribution("pv", "", at), contribution("pv.route", v.route, at, { top: { rank: at, data: { traceId: v.traceId } } })];
  for (const m of ROUTE_MEASURES) {
    const value = ROUTE_VALUE[m](v);
    if (value !== null) out.push(contribution("pv.m", joinKey(v.route, m), at, { sum: value }));
  }
  if (v.device && v.renderMs !== null) out.push(contribution("pv.dev", joinKey(v.route, v.device), at, { sum: v.renderMs, values: [v.renderMs] }));
  if (v.largeImages !== null) out.push(contribution("pv.large", v.route, at, { sum: v.largeImages, values: [v.largeImages] }));
  for (const p of PAGE_PHASES) {
    const value = PHASE_VALUE[p](v);
    if (value !== null) out.push(contribution("pv.g", p, at, { sum: value, values: [value] }));
  }
  return out;
}

function reactContributions(s: Span): Contribution[] {
  const at = s.startMs;
  const route = s.attributes[ATTR_BROWSER_ROUTE];
  const out = [contribution("react", "", at)];
  for (const c of componentStatsOf(s)) {
    out.push(contribution("rc", c.name, at, { c: [c.renders, c.actualMs, c.selfMs, c.wasted, c.context], top: { rank: at, data: { traceId: s.traceId } } }));
    if (typeof route === "string" && route) out.push(contribution("rc.route", joinKey(c.name, route), at));
  }
  return out;
}

/** Everything one trace's page views and React reports add to the rollups. A bot's renderer adds nothing. */
export function renderFacts(trace: Trace): Contribution[] {
  return withoutBotBrowser(trace).flatMap((s) => {
    const type = browserTypeOf(s);
    if (type === "pageview") return viewContributions(pageViewOf(s));
    return type === "react" ? reactContributions(s) : [];
  });
}
