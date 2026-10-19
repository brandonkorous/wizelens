import { type Agg, avgOfAgg } from "../scale/agg.js";
import { histPercentile } from "../scale/hist.js";
import type { Need, NeedResults, PageData, PageDef } from "../scale/needs.js";
import { bucketStarts, percentChange } from "../stats/common.js";
import type { ComponentRow, PhaseStat, RenderPhase, RouteRow } from "../stats/rendering.js";
import { MODEL_LIST_MAX } from "./database.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
import { aggByKey, avgs, counts, groupNeed, type Series, seriesNeed, seriesOf, totalOf, uniqueNeeds } from "./read.js";
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
  routes: RouteRow[];
  components: ComponentRow[];
  componentCount: number;
  /** Routes before the list limit. */
  routeCount: number;
  hasReact: boolean;
  starts: number[];
  chart: { avg: Series; p75: Series; views: Series };
  phases: Record<PhaseStat, RenderPhase[]>;
  cards: { render: RenderCard; ssr: RenderCard; hydration: RenderCard; issues: RenderCard };
}

const PHASES: { key: string; phase: string; label: string; kind: RenderPhase["kind"] }[] = [
  { key: "ssr", phase: "ssr", label: "Server-side rendering (SSR)", kind: "ms" },
  { key: "client", phase: "client", label: "Client render", kind: "ms" },
  { key: "hydration", phase: "hydration", label: "Hydration", kind: "ms" },
  { key: "images", phase: "image", label: "Image loading", kind: "ms" },
  { key: "cls", phase: "cls", label: "Layout shift", kind: "score" },
];

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
];

/** The Rendering page. */
export const renderingPage: PageDef<RenderingModel> = {
  needs: () => uniqueNeeds(firstNeeds()),
  followUp(_ctx, first) {
    const names = issueNames(first);
    return names.length ? [seriesNeed("issues", "rc", "cur", RENDER_BUCKETS, { split: true, filter: { keys: names } })] : [];
  },
  model(d) {
    const components = componentRowsOf(d, "cur");
    const routes = routeRowsOf(d, "cur");
    const withIssues = components.filter((c) => c.issues.length > 0).length;
    return {
      meta: metaOf(d),
      views: viewsOf(d, "cur"),
      routes: routes.slice(0, MODEL_LIST_MAX),
      routeCount: routes.length,
      components: components.slice(0, MODEL_LIST_MAX),
      componentCount: components.length,
      hasReact: totalOf(d, "react.cur").n > 0,
      starts: bucketStarts(d.window, RENDER_BUCKETS),
      chart: { avg: avgs(seriesOf(d, "cards", RENDER_BUCKETS, "render")), p75: seriesOf(d, "p75", RENDER_BUCKETS).map((a) => p75(a)), views: counts(seriesOf(d, "views", RENDER_BUCKETS)) },
      phases: { avg: phasesOf(d, "avg"), p75: phasesOf(d, "p75") },
      cards: { render: metricCard(d, "render"), ssr: metricCard(d, "ssr"), hydration: metricCard(d, "hydration"), issues: issuesCard(d, withIssues) },
    };
  },
};
