// The page of one page route: views and Web Vitals over time, the components it renders, and its newest page loads.
import { avgOfAgg } from "../scale/agg.js";
import type { TraceItem } from "../scale/facts-lists.js";
import { ROUTE_MEASURES, type RouteMeasure } from "../scale/facts-render.js";
import { joinKey, splitKey } from "../scale/kinds.js";
import type { PageDef, PageData } from "../scale/needs.js";
import { bucketStarts } from "../stats/common.js";
import { CHART_BUCKETS } from "./database.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
import { aggByKey, avgs, byDesc, counts, groupNeed, listNeed, listOf, rowsOf, type Series, seriesNeed, seriesOf, totalOf, uniqueNeeds } from "./read.js";

export interface RoutePageModel {
  meta: ModelMeta;
  route: string;
  views: number;
  prevViews: number;
  /** Average of each measure (ms; layout shift is a score); null when not measured. */
  averages: Record<RouteMeasure, number | null>;
  starts: number[];
  chart: { views: Series; prevViews: Series } & Record<RouteMeasure, Series>;
  /** Components rendered on the route, most renders first. */
  components: { name: string; count: number }[];
  /** The newest page loads of the route. */
  loads: TraceItem[];
}

const byMeasure = <T>(f: (k: RouteMeasure) => T): Record<RouteMeasure, T> => Object.fromEntries(ROUTE_MEASURES.map((k) => [k, f(k)])) as Record<RouteMeasure, T>;

function chartOf(d: PageData, route: string): RoutePageModel["chart"] {
  const views = counts(seriesOf(d, "views", CHART_BUCKETS));
  const prevViews = counts(seriesOf(d, "views.prev", CHART_BUCKETS));
  return { views, prevViews, ...byMeasure((k) => avgs(seriesOf(d, "m.series", CHART_BUCKETS, joinKey(route, k)))) };
}

/** The Route page. Params: route ("/checkout"). */
export const routePage: PageDef<RoutePageModel> = {
  needs: (ctx) => {
    const route = ctx.params.route ?? "";
    const keys = { filter: { keys: [route] } };
    const measures = { filter: { prefix: joinKey(route, "") } };
    return uniqueNeeds([
      ...META_NEEDS,
      groupNeed("r", "pv.route", "cur", { ids: true, ...keys }),
      groupNeed("r.prev", "pv.route", "prev", keys),
      groupNeed("m", "pv.m", "cur", measures),
      seriesNeed("views", "pv.route", "cur", CHART_BUCKETS, keys),
      seriesNeed("views.prev", "pv.route", "prev", CHART_BUCKETS, keys),
      seriesNeed("m.series", "pv.m", "cur", CHART_BUCKETS, { ...measures, split: true }),
      groupNeed("rc", "rc.route", "cur", { filter: { parts: [null, route] } }),
    ]);
  },
  followUp(_ctx, first) {
    const ids = rowsOf(first, "r")[0]?.agg.ids ?? [];
    return ids.length ? [listNeed("loads", "traces", "cur", { filter: { traceIds: ids }, limit: ids.length })] : [];
  },
  model(d) {
    const route = d.params.route ?? "";
    const m = aggByKey(d, "m");
    return {
      meta: metaOf(d),
      route,
      views: totalOf(d, "r").n,
      prevViews: totalOf(d, "r.prev").n,
      averages: byMeasure((k) => {
        const a = m.get(joinKey(route, k));
        return a ? avgOfAgg(a) : null;
      }),
      starts: bucketStarts(d.window, CHART_BUCKETS),
      chart: chartOf(d, route),
      components: [...rowsOf(d, "rc")].sort(byDesc((r) => r.agg.n)).map((r) => ({ name: splitKey(r.key)[0]!, count: r.agg.n })),
      loads: listOf<TraceItem>(d, "loads").items,
    };
  },
};
