import { type Agg, avgOfAgg } from "../scale/agg.js";
import { histPercentile } from "../scale/hist.js";
import type { Need, NeedResults, PageData, PageDef } from "../scale/needs.js";
import { bucketStarts, percentChange } from "../stats/common.js";
import type { ComponentRow, PhaseStat, RenderPhase, RouteRow } from "../stats/rendering.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
import { IMPACT_RANK, type PageInfo, pagedRows, type SortValue } from "./paged.js";
import { aggByKey, avgs, counts, groupNeed, type Series, seriesNeed, seriesOf, totalOf, uniqueNeeds } from "./read.js";
import { type DeviceTable, deviceNeeds, deviceTableOf } from "./render-devices.js";
import { componentNeeds, componentRowsOf, routeNeeds, routeRowsOf, viewsOf } from "./render-rows.js";

export const RENDER_BUCKETS = 24;

export interface RenderCard {
  value: number | null;
  change: number | null;
  series: Series;
}

export interface RenderingModel {
  meta: ModelMeta;
  views: number;
  /** One page of the routes (URL key "rt"), and where it sits. */
  routes: RouteRow[];
  routePaging: PageInfo;
  /** One page of the components (URL key "cmp"), and where it sits. */
  components: ComponentRow[];
  componentPaging: PageInfo;
  componentCount: number;
  routeCount: number;
  hasReact: boolean;
  starts: number[];
  chart: { avg: Series; p75: Series; views: Series };
  phases: Record<PhaseStat, RenderPhase[]>;
  cards: { render: RenderCard; ssr: RenderCard; hydration: RenderCard; issues: RenderCard };
  /** Views and render time per page on phones, tablets, and desktops. */
  devices: DeviceTable;
}

const PHASES: { key: string; phase: string; label: string; kind: RenderPhase["kind"] }[] = [
  { key: "ssr", phase: "ssr", label: "Server response (server render, or the file host)", kind: "ms" },
  { key: "client", phase: "client", label: "Client render", kind: "ms" },
  { key: "hydration", phase: "hydration", label: "Hydration", kind: "ms" },
  { key: "images", phase: "image", label: "Image loading", kind: "ms" },
  { key: "cls", phase: "cls", label: "Layout shift", kind: "score" },
];

/** Rows each table shows at first. */
export const RENDER_PAGE_SIZE = 6;

const orNone = (v: number | null) => v ?? -1;

/** Columns the routes table sorts by (rtsort=-views). */
const ROUTE_SORTS: Record<string, SortValue<RouteRow>> = {
  route: (r) => r.route,
  views: (r) => r.views,
  render: (r) => orNone(r.avgRenderMs),
  ssr: (r) => orNone(r.avgSsrMs),
  hydration: (r) => orNone(r.avgHydrationMs),
  lcp: (r) => orNone(r.avgLcpMs),
  images: (r) => r.largeImages,
  cls: (r) => orNone(r.avgCls),
  issue: (r) => r.issues.length,
};

/** Columns the components table sorts by (cmpsort=-total). */
const COMPONENT_SORTS: Record<string, SortValue<ComponentRow>> = {
  name: (c) => c.name,
  renders: (c) => c.renders,
  avg: (c) => c.avgMs,
  self: (c) => c.selfMs,
  total: (c) => c.totalMs,
  impact: (c) => IMPACT_RANK[c.impact],
  issues: (c) => c.issues.length,
};

const p75 = (a: Agg | undefined): number | null => (a?.hist ? histPercentile(a.hist, a.n, 75) : null);
const avg = (a: Agg | undefined): number | null => (a ? avgOfAgg(a) : null);

function phasesOf(d: NeedResults, stat: PhaseStat): RenderPhase[] {
  const by = aggByKey(d, "pv.g.cur");
  return PHASES.map((p) => ({ key: p.key, label: p.label, value: (stat === "avg" ? avg : p75)(by.get(p.phase)), kind: p.kind }));
}

function metricCard(d: NeedResults, phase: string): RenderCard {
  const value = avg(aggByKey(d, "pv.g.cur").get(phase));
  const before = avg(aggByKey(d, "pv.g.prev").get(phase));
  return { value, change: percentChange(value, before), series: avgs(seriesOf(d, "cards", RENDER_BUCKETS, phase)) };
}

/** Names of the components with issues in the window. */
const issueNames = (d: NeedResults): string[] => componentRowsOf(d, "cur").filter((c) => c.issues.length > 0).map((c) => c.name);

function issuesCard(d: PageData, withIssues: number): RenderCard {
  const prevIssues = componentRowsOf(d, "prev").filter((c) => c.issues.length > 0).length;
  const split = d.series.issues?.byKey ?? {};
  const series = Array.from({ length: RENDER_BUCKETS }, (_, i) => Object.values(split).reduce((t, list) => t + (list[i]?.c[0] ?? 0), 0));
  return { value: withIssues, change: totalOf(d, "react.prev").n > 0 ? percentChange(withIssues, prevIssues) : null, series };
}

const firstNeeds = (): Need[] => [
  ...META_NEEDS,
  ...routeNeeds("cur"),
  ...componentNeeds("cur"),
  ...componentNeeds("prev"),
  groupNeed("react.cur", "react", "cur"),
  groupNeed("react.prev", "react", "prev"),
  groupNeed("pv.g.cur", "pv.g", "cur", { hist: true }),
  groupNeed("pv.g.prev", "pv.g", "prev"),
  seriesNeed("cards", "pv.g", "cur", RENDER_BUCKETS, { split: true, filter: { keys: ["render", "ssr", "hydration"] } }),
  seriesNeed("p75", "pv.g", "cur", RENDER_BUCKETS, { hist: true, filter: { keys: ["render"] } }),
  seriesNeed("views", "pv", "cur", RENDER_BUCKETS),
  ...deviceNeeds("cur"),
];

/** The Rendering page. Params: q (text in a route or component name); rtpage, rtsize, rtsort for routes; cmppage, cmpsize, cmpsort for components. */
export const renderingPage: PageDef<RenderingModel> = {
  needs: () => uniqueNeeds(firstNeeds()),
  followUp(_ctx, first) {
    const names = issueNames(first);
    return names.length ? [seriesNeed("issues", "rc", "cur", RENDER_BUCKETS, { split: true, filter: { keys: names } })] : [];
  },
  model(d) {
    // The text filter narrows the two tables; the cards count everything.
    const q = (d.params.q ?? "").trim().toLowerCase();
    const all = componentRowsOf(d, "cur");
    const components = all.filter((c) => !q || c.name.toLowerCase().includes(q));
    const routes = routeRowsOf(d, "cur").filter((r) => !q || r.route.toLowerCase().includes(q));
    const withIssues = all.filter((c) => c.issues.length > 0).length;
    const routePage = pagedRows(routes, d.params, "rt", RENDER_PAGE_SIZE, ROUTE_SORTS);
    const componentPage = pagedRows(components, d.params, "cmp", RENDER_PAGE_SIZE, COMPONENT_SORTS);
    return {
      meta: metaOf(d),
      views: viewsOf(d, "cur"),
      routes: routePage.rows,
      routePaging: routePage.paging,
      routeCount: routes.length,
      components: componentPage.rows,
      componentPaging: componentPage.paging,
      componentCount: components.length,
      hasReact: totalOf(d, "react.cur").n > 0,
      starts: bucketStarts(d.window, RENDER_BUCKETS),
      chart: { avg: avgs(seriesOf(d, "cards", RENDER_BUCKETS, "render")), p75: seriesOf(d, "p75", RENDER_BUCKETS).map((a) => p75(a)), views: counts(seriesOf(d, "views", RENDER_BUCKETS)) },
      phases: { avg: phasesOf(d, "avg"), p75: phasesOf(d, "p75") },
      cards: { render: metricCard(d, "render"), ssr: metricCard(d, "ssr"), hydration: metricCard(d, "hydration"), issues: issuesCard(d, withIssues) },
      devices: deviceTableOf(d, "cur"),
    };
  },
};
