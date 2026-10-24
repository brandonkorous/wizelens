import { ATTR_BROWSER_NAVIGATION, ATTR_BROWSER_ROUTE, ATTR_PAGE, browserTypeOf } from "../attributes.js";
import { withoutBotBrowser } from "../bots.js";
import type { Span, Trace } from "../types.js";
import { avgOf, groupBy, type Impact, percentileOf } from "./common.js";
import type { InsightGroup } from "./insights.js";
import { type ComponentRow, componentRows } from "./rendering-components.js";

export * from "./rendering-components.js";

/** One page load or client-side route change, with its timings. Null fields were not measured. */
export interface PageView {
  traceId: string;
  startMs: number;
  route: string;
  navigation: "load" | "spa";
  url: string | null;
  renderMs: number | null;
  ttfbMs: number | null;
  ssrMs: number | null;
  clientRenderMs: number | null;
  hydrationMs: number | null;
  fcpMs: number | null;
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
  loadMs: number | null;
  imageMs: number | null;
  images: number | null;
  largeImages: number | null;
}

const num = (s: Span, key: string): number | null => {
  const v = s.attributes[key];
  const n = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** A page's host and route ("mypiggles.com/"), so the same route on two sites is two routes; the route alone when no URL is known. */
function routeKey(route: unknown, url: unknown): string {
  const path = typeof route === "string" && route ? route : "/";
  if (typeof url !== "string") return path;
  try {
    return `${new URL(url).host}${path}`;
  } catch {
    return path;
  }
}

export function pageViewOf(s: Span): PageView {
  const url = s.attributes["url.full"];
  return {
    traceId: s.traceId,
    startMs: s.startMs,
    route: routeKey(s.attributes[ATTR_BROWSER_ROUTE], url),
    navigation: s.attributes[ATTR_BROWSER_NAVIGATION] === "spa" ? "spa" : "load",
    url: typeof url === "string" ? url : null,
    renderMs: num(s, ATTR_PAGE.renderMs) ?? (s.durationMs > 0 ? s.durationMs : null),
    ttfbMs: num(s, ATTR_PAGE.ttfbMs),
    ssrMs: num(s, ATTR_PAGE.ssrMs),
    clientRenderMs: num(s, ATTR_PAGE.clientRenderMs),
    hydrationMs: num(s, ATTR_PAGE.hydrationMs),
    fcpMs: num(s, ATTR_PAGE.fcpMs),
    lcpMs: num(s, ATTR_PAGE.lcpMs),
    cls: num(s, ATTR_PAGE.cls),
    inpMs: num(s, ATTR_PAGE.inpMs),
    loadMs: num(s, ATTR_PAGE.loadMs),
    imageMs: num(s, ATTR_PAGE.imageMs),
    images: num(s, ATTR_PAGE.images),
    largeImages: num(s, ATTR_PAGE.largeImages),
  };
}

/** Page views in the traces, newest first. */
export function pageViews(traces: readonly Trace[]): PageView[] {
  const out: PageView[] = [];
  for (const t of traces) for (const s of withoutBotBrowser(t)) if (browserTypeOf(s) === "pageview") out.push(pageViewOf(s));
  return out.sort((a, b) => b.startMs - a.startMs);
}

/** The values of one field, without the unmeasured ones. */
export const measured = (views: readonly PageView[], key: keyof PageView): number[] =>
  views.map((v) => v[key]).filter((x): x is number => typeof x === "number");

export type RouteIssue = "none" | "minor" | "high";

export interface RouteRow {
  route: string;
  views: number;
  avgRenderMs: number | null;
  avgSsrMs: number | null;
  avgHydrationMs: number | null;
  avgLcpMs: number | null;
  avgCls: number | null;
  largeImages: number;
  issue: RouteIssue;
  issues: string[];
  totalRenderMs: number;
  lastSeenMs: number;
  exampleTraceId: string;
}

type RouteNumbers = Pick<RouteRow, "avgRenderMs" | "avgSsrMs" | "avgLcpMs" | "avgCls" | "largeImages"> & {
  /** Render time of the same page loads that measured SSR, so the share compares like with like. */
  avgSsrRenderMs?: number | null;
};

const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Issue texts for a route; high when LCP > 4 s, CLS > 0.25, or render > 1 s. */
export function routeIssues(r: RouteNumbers): { issue: RouteIssue; issues: string[] } {
  const high: string[] = [];
  const minor: string[] = [];
  if ((r.avgLcpMs ?? 0) > 4000) high.push(`Slow largest paint (${sec(r.avgLcpMs!)})`);
  else if ((r.avgLcpMs ?? 0) > 2500) minor.push(`Largest paint needs work (${sec(r.avgLcpMs!)})`);
  if ((r.avgCls ?? 0) > 0.25) high.push(`Layout shifts (CLS ${r.avgCls!.toFixed(2)})`);
  else if ((r.avgCls ?? 0) > 0.1) minor.push(`Some layout shift (CLS ${r.avgCls!.toFixed(2)})`);
  if ((r.avgRenderMs ?? 0) > 1000) high.push(`Slow render (${sec(r.avgRenderMs!)})`);
  if (r.largeImages > 0) minor.push("Large images without lazy loading");
  const ssr = r.avgSsrMs ?? 0;
  const render = r.avgSsrRenderMs ?? r.avgRenderMs;
  if (ssr > 200 && render && ssr / render > 0.3) minor.push(`Server render is ${Math.min(100, Math.round((ssr / render) * 100))}% of render time`);
  return { issue: high.length ? "high" : minor.length ? "minor" : "none", issues: [...high, ...minor] };
}

function routeRowOf(route: string, list: PageView[]): RouteRow {
  const numbers: RouteNumbers = {
    avgRenderMs: avgOf(measured(list, "renderMs")),
    avgSsrMs: avgOf(measured(list, "ssrMs")),
    avgLcpMs: avgOf(measured(list, "lcpMs")),
    avgCls: avgOf(measured(list, "cls")),
    largeImages: Math.max(0, ...measured(list, "largeImages")),
    avgSsrRenderMs: avgOf(measured(list.filter((v) => v.ssrMs !== null), "renderMs")),
  };
  const latest = list.reduce((a, b) => (b.startMs > a.startMs ? b : a));
  return {
    route,
    views: list.length,
    ...numbers,
    avgHydrationMs: avgOf(measured(list, "hydrationMs")),
    ...routeIssues(numbers),
    totalRenderMs: measured(list, "renderMs").reduce((t, v) => t + v, 0),
    lastSeenMs: latest.startMs,
    exampleTraceId: latest.traceId,
  };
}

/** Routes with their averages and issues, busiest first. */
export function routeRows(views: readonly PageView[]): RouteRow[] {
  return [...groupBy(views, (v) => v.route)].map(([route, list]) => routeRowOf(route, list)).sort((a, b) => b.views - a.views);
}

export type PhaseStat = "avg" | "p75";

export interface RenderPhase {
  key: string;
  label: string;
  /** Ms, or a score for layout shift. Null when not measured. */
  value: number | null;
  kind: "ms" | "score";
}

/** Average or p75 of each render phase over the page views. */
export function renderPhases(views: readonly PageView[], stat: PhaseStat): RenderPhase[] {
  const pick = (key: keyof PageView) => {
    const list = measured(views, key);
    return stat === "avg" ? avgOf(list) : percentileOf(list, 75);
  };
  return [
    { key: "ssr", label: "Server-side rendering (SSR)", value: pick("ssrMs"), kind: "ms" },
    { key: "client", label: "Client render", value: pick("clientRenderMs"), kind: "ms" },
    { key: "hydration", label: "Hydration", value: pick("hydrationMs"), kind: "ms" },
    { key: "images", label: "Image loading", value: pick("imageMs"), kind: "ms" },
    { key: "cls", label: "Layout shift", value: pick("cls"), kind: "score" },
  ];
}

const ROUTE_IMPACT: Record<RouteIssue, Impact> = { high: "high", minor: "medium", none: "low" };

/** The insight of a route with issues. */
export function routeInsight(r: RouteRow): InsightGroup {
  return {
    key: `render|route|${r.route}`,
    kind: "render",
    area: "render",
    impact: ROUTE_IMPACT[r.issue],
    title: r.issue === "high" ? "Render bottleneck" : "Render opportunity",
    description: `${r.route}: ${r.issues.join("; ")}. Seen in ${r.views} page view${r.views === 1 ? "" : "s"}.`,
    shape: r.route,
    occurrences: r.views,
    count: r.views,
    totalMs: r.totalRenderMs,
    endpoints: [r.route],
    lastSeenMs: r.lastSeenMs,
    exampleTraceId: r.exampleTraceId,
  };
}

/** The insight of a component with issues. */
export function componentInsight(c: ComponentRow): InsightGroup {
  return {
    key: `render|component|${c.name}`,
    kind: "render",
    area: "render",
    impact: c.impact,
    title: `Component hotspot: ${c.name}`,
    description: `${c.issues.join("; ")}. ${c.renders} renders, ${Math.round(c.selfMs)} ms in its own code.`,
    shape: c.name,
    occurrences: c.renders,
    count: c.renders,
    totalMs: c.selfMs,
    endpoints: c.routes,
    lastSeenMs: c.lastSeenMs,
    exampleTraceId: c.exampleTraceId,
  };
}

/** Insights from page views and React renders (slow routes, layout shift, re-rendering components). */
export function renderInsightGroups(traces: readonly Trace[]): InsightGroup[] {
  const views = pageViews(traces);
  const routes = routeRows(views).filter((r) => r.issue !== "none").map(routeInsight);
  const components = componentRows(traces, views.length).filter((c) => c.issues.length > 0).map(componentInsight);
  return [...routes, ...components];
}
