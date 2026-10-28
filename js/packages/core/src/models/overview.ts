import { avgOfAgg } from "../scale/agg.js";
import type { RequestItem } from "../scale/facts-lists.js";
import { histPercentile } from "../scale/hist.js";
import type { PageData, PageDef } from "../scale/needs.js";
import { type InsightGroup, insightHeadline } from "../stats/insights.js";
import { bucketStarts } from "../stats/common.js";
import { ACTIVITY_BUCKETS, type ActivitySeries, type Headline, type RequestHeadlines } from "../stats/overview.js";
import { type ErrorGroup, rawService } from "../stats/errors.js";
import type { ServiceRow } from "../stats/services.js";
import { headlineNeeds, headlinesFrom } from "./headlines.js";
import { META_NEEDS, type ModelMeta, metaOf, scoped, serviceParam } from "./input.js";
import { insightGroupsOf, insightNeeds } from "./insight-groups.js";
import type { Apdex } from "./apdex.js";
import { apdexNeed, apdexOverall } from "./apdex-rows.js";
import { issueInfos, lifeNeed } from "./error-issues.js";
import { errorGroupOf } from "./errors.js";
import { insightIssues } from "./insights.js";
import { aggByKey, avgs, counts, groupNeed, listNeed, listOf, rowsOf, type Series, seriesNeed, seriesOf, totalOf, uniqueNeeds } from "./read.js";
import { edgeNeeds, edgesOfRows, serviceNeeds, serviceRowsOf } from "./service-rows.js";

export interface TimingPart {
  key: string;
  label: string;
  avg: number | null;
  p95: number | null;
  /** Shade of the bar, in percent. */
  shade: number;
}

export interface OverviewModel {
  meta: ModelMeta;
  empty: boolean;
  /** Page views in the range: a site with no server sends these and no requests. */
  pageViews: number;
  headlines: RequestHeadlines;
  /** Distinct insights, the same number the Insights page lists. */
  insightsFound: Headline;
  /** `prevRequests`: the compared period's requests per bucket, for a faint line. */
  activity: ActivitySeries & { avgDuration: (number | null)[]; prevRequests: Series };
  timing: TimingPart[];
  services: ServiceRow[];
  recent: RequestItem[];
  insights: InsightGroup[];
  /** Error groups first seen in this range, or resolved and back again; newest first. */
  freshErrors: { group: ErrorGroup; why: "new" | "regressed" }[];
  /** Apdex of the services that run your code, each against its own target. */
  apdex: Apdex | null;
}

const PARTS: { key: string; label: string; shade: number }[] = [
  { key: "request", label: "Request", shade: 100 },
  { key: "server", label: "Server", shade: 70 },
  { key: "database", label: "Database", shade: 55 },
  { key: "render", label: "Render", shade: 42 },
  { key: "network", label: "Network", shade: 30 },
];

const TOP_SERVICES = 5;
const TOP_RECENT = 5;
const TOP_INSIGHTS = 3;
/** Recent error groups looked at for "new" and "regressed", and how many the panel shows. */
const RECENT_ERRORS = 50;
const TOP_FRESH = 5;

/** Insights nobody marked fixed or dismissed. */
function openInsights(d: PageData, groups: InsightGroup[]): InsightGroup[] {
  const info = insightIssues(d, groups);
  return groups.filter((g) => info[g.key]!.status === "unresolved" || info[g.key]!.status === "regressed");
}

function freshErrorsOf(d: PageData): OverviewModel["freshErrors"] {
  const rows = rowsOf(d, "err.recent");
  const info = issueInfos(d, rows.map((r) => r.key));
  const out = rows.flatMap((r) => {
    const i = info[r.key]!;
    const why = i.status === "regressed" ? "regressed" : i.isNew && i.status === "unresolved" ? "new" : null;
    return why ? [{ group: errorGroupOf(r), why } as const] : [];
  });
  return out.slice(0, TOP_FRESH);
}

/** Where request time goes: average and p95 of each part. */
function timingOf(d: PageData): TimingPart[] {
  const parts = aggByKey(d, "timing");
  return PARTS.map((p) => {
    const a = parts.get(p.key);
    return { key: p.key, label: p.label, avg: a ? avgOfAgg(a) : null, p95: a?.hist ? histPercentile(a.hist, a.n, 95) : null, shade: p.shade };
  });
}

function activityOf(d: PageData): OverviewModel["activity"] {
  const s = seriesOf(d, "activity", ACTIVITY_BUCKETS);
  const prev = counts(seriesOf(d, "activity.prev", ACTIVITY_BUCKETS));
  return { starts: bucketStarts(d.window, ACTIVITY_BUCKETS), requests: counts(s), errors: s.map((a) => a.err), avgDuration: avgs(s), prevRequests: prev };
}

/** The service's own row and the rows it calls; every row without a service filter. */
function servicesOf(d: PageData, service: string | undefined): ServiceRow[] {
  const rows = serviceRowsOf(d, "cur");
  if (!service) return rows;
  const calls = new Set(edgesOfRows(d).filter((e) => e.from === service).map((e) => e.to));
  return rows.filter((r) => r.name === service || calls.has(r.name));
}

/** The Overview page. Params: service (a display name). */
export const overviewPage: PageDef<OverviewModel> = {
  needs: (ctx) => {
    const service = serviceParam(ctx.params);
    const one = scoped(service);
    return uniqueNeeds([
      ...META_NEEDS,
      ...headlineNeeds("h", "req", undefined, service),
      seriesNeed("activity", "req", "cur", ACTIVITY_BUCKETS, one),
      groupNeed("pv.cur", "pv", "cur"),
      seriesNeed("activity.prev", "req", "prev", ACTIVITY_BUCKETS, one),
      groupNeed("timing", "req.part", "cur", { hist: true, ...one }),
      ...serviceNeeds("cur"),
      ...(service ? edgeNeeds() : []),
      listNeed("recent", "requests", "cur", { limit: TOP_RECENT, filter: service ? { service: rawService(service) } : {} }),
      ...insightNeeds("cur", "all", service),
      ...insightNeeds("prev", "all", service),
      lifeNeed(service ?? ""),
      apdexNeed(service ? `api:${rawService(service)}` : undefined),
      groupNeed("err.recent", "err.g", "cur", { top: true, order: { by: "lastMs", desc: true, limit: RECENT_ERRORS }, ...(service ? { filter: { prefix: `${service}|` } } : {}) }),
    ]);
  },
  model(d) {
    const groups = insightGroupsOf(d, "cur");
    const headlines = headlinesFrom(d, "h");
    return {
      meta: metaOf(d),
      empty: headlines.total.value === 0,
      pageViews: totalOf(d, "pv.cur").n,
      headlines,
      insightsFound: insightHeadline(groups, insightGroupsOf(d, "prev"), d.window),
      activity: activityOf(d),
      timing: timingOf(d),
      services: servicesOf(d, serviceParam(d.params)).slice(0, TOP_SERVICES),
      recent: listOf<RequestItem>(d, "recent").items,
      insights: openInsights(d, groups).slice(0, TOP_INSIGHTS),
      freshErrors: freshErrorsOf(d),
      apdex: apdexOverall(d),
    };
  },
};
