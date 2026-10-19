import { splitKey } from "../scale/kinds.js";
import type { Need, NeedResults, PageData, PageDef, WindowRef } from "../scale/needs.js";
import { bucketStarts, percentChange, percentOf } from "../stats/common.js";
import { displayService, type ErrorEvent, type ErrorGroup, type ServiceErrors } from "../stats/errors.js";
import { SPARK_BUCKETS } from "../stats/overview.js";
import { CHART_BUCKETS } from "./database.js";
import { endpointGroupKeys, endpointGroupsNeed, ERROR_PAGE_SIZE, type ErrorFilter, errorFilterOf, errorListNeed } from "./error-filter.js";
import { type IssueInfo, issueInfos, issueKeys, lifeNeed } from "./error-issues.js";
import { firstSeenBounds, releasesNeed, releasesOf } from "./release-rows.js";
import { META_NEEDS, type ModelMeta, metaOf, pageParams, scoped } from "./input.js";
import { aggByKey, byDesc, counter, counts, groupCount, groupNeed, type Row, rowsOf, type Series, seriesNeed, seriesOf, totalOf, uniqueNeeds } from "./read.js";

export interface ServiceErrorRow extends ServiceErrors {
  prevExceptions: number;
  trend: Series;
}

export interface ErrorsModel {
  meta: ModelMeta;
  hasRequests: boolean;
  exceptions: number;
  filter: ErrorFilter;
  /** One page of the groups that match the filter. */
  groups: ErrorGroup[];
  /** Groups that match the filter, on every page. */
  groupCount: number;
  page: number;
  size: number;
  /** The busiest endpoints with errors, for the endpoint filter. */
  endpoints: { endpoint: string; count: number }[];
  /** Issue status, first seen, and assignee of the listed and selected groups. */
  issues: Record<string, IssueInfo>;
  /** True when the host keeps issue states (resolve, ignore, assign work). */
  hasIssues: boolean;
  /** The chosen service's versions, newest first, for the release filter. */
  releases: { version: string; firstMs: number }[];
  /** The `group` parameter's group, found by key even when it is not among the listed groups; null without one. */
  selected: ErrorGroup | null;
  types: { type: string; count: number }[];
  services: ServiceErrorRow[];
  starts: number[];
  /** `prev`: the compared period's exceptions per bucket, for a faint line. */
  chart: { plain: Series; critical: Series; prev: Series };
  cards: { exceptions: number; errorRate: number; endpoints: number; critical: number };
  change: { exceptions: number | null; errorRate: number | null; endpoints: number | null; critical: number | null };
  sparks: { exceptions: Series; errorRate: Series; critical: Series };
}

const TREND_BUCKETS = 16;
/** Endpoints offered by the endpoint filter. */
const ENDPOINT_OPTIONS = 50;
/** Groups keep at most this many trace ids and endpoints, so the model stays small over long ranges. */
const GROUP_LIST_MAX = 50;

/** Endpoints per error group, newest first. */
function endpointsByGroup(rows: readonly Row[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { key } of [...rows].sort(byDesc((r) => r.agg.lastMs))) {
    const [group = "", endpoint = ""] = splitKey(key);
    out.set(group, [...(out.get(group) ?? []), endpoint]);
  }
  return out;
}

/** One error group from an `err.g` row; `endpoints` from `endpointsByGroup` (empty when not read). */
export function errorGroupOf({ key, agg }: Row, endpoints: ReadonlyMap<string, string[]> = new Map()): ErrorGroup {
  const latest = agg.top as ErrorEvent;
  const { type, message, service, endpoint } = latest;
  const list = (endpoints.get(key) ?? []).slice(0, GROUP_LIST_MAX);
  return { key, type, message, service, endpoint, count: agg.n, firstSeenMs: agg.firstMs, lastSeenMs: agg.lastMs, critical: (agg.c[0] ?? 0) > 0, latest, endpoints: list, traceIds: agg.ids.slice(0, GROUP_LIST_MAX) };
}

function cardsOf(d: NeedResults, win: WindowRef): ErrorsModel["cards"] {
  const requests = totalOf(d, `req.${win}`);
  return {
    exceptions: totalOf(d, `err.${win}`).n,
    errorRate: percentOf(requests.err, requests.n),
    endpoints: groupCount(d, `err.e.${win}`),
    critical: rowsOf(d, `err.g.${win}`).filter((r) => (r.agg.c[0] ?? 0) > 0).length,
  };
}

function servicesOf(d: PageData): ServiceErrorRow[] {
  const exceptions = aggByKey(d, "err.s.cur");
  const before = aggByKey(d, "err.s.prev");
  const requests = new Map<string, { n: number; err: number }>();
  for (const { key, agg } of rowsOf(d, "req.svc")) {
    const s = displayService(splitKey(key)[0]!);
    const r = requests.get(s) ?? { n: 0, err: 0 };
    requests.set(s, { n: r.n + agg.n, err: r.err + agg.err });
  }
  const names = [...new Set([...exceptions.keys(), ...requests.keys()])];
  return names
    .map((service): ServiceErrorRow => {
      const r = requests.get(service) ?? { n: 0, err: 0 };
      const trend = counts(seriesOf(d, "trend", TREND_BUCKETS, service));
      return { service, exceptions: exceptions.get(service)?.n ?? 0, requests: r.n, errorRate: percentOf(r.err, r.n), prevExceptions: before.get(service)?.n ?? 0, trend };
    })
    .filter((s) => s.exceptions > 0 || s.requests > 0)
    .sort((a, b) => b.exceptions - a.exceptions || b.requests - a.requests || (a.service < b.service ? -1 : 1));
}

function changeOf(d: PageData, cards: ErrorsModel["cards"]): ErrorsModel["change"] {
  const prev = cardsOf(d, "prev");
  const hasPrev = totalOf(d, "meta.prev").n > 0;
  const change = (a: number, b: number) => (hasPrev ? percentChange(a, b) : null);
  return { exceptions: change(cards.exceptions, prev.exceptions), errorRate: change(cards.errorRate, prev.errorRate), endpoints: change(cards.endpoints, prev.endpoints), critical: change(cards.critical, prev.critical) };
}

/** Card needs of one window; with a service, only its requests and errors. */
const windowNeeds = (win: WindowRef, service: string | undefined) => [
  groupNeed(`req.${win}`, "req", win, scoped(service)),
  groupNeed(`err.${win}`, "err", win, scoped(service)),
  groupNeed(`err.g.${win}`, "err.g", win, service ? { filter: { prefix: `${service}|` } } : {}),
  groupNeed(`err.e.${win}`, "err.e", win, { order: { by: "n", desc: true, limit: 0 }, ...scoped(service) }),
  groupNeed(`err.s.${win}`, "err.s", win),
];

/** Every need besides the group list: cards, charts, types, endpoints, and the services table. */
function pageNeeds(service: string | undefined): Need[] {
  const one = scoped(service);
  return [
    ...META_NEEDS,
    ...windowNeeds("cur", service),
    ...windowNeeds("prev", service),
    groupNeed("err.ge", "err.ge", "cur", service ? { filter: { prefix: `${service}|` } } : {}),
    groupNeed("err.t", "err.t", "cur", one),
    groupNeed("endpoints", "err.e", "cur", { order: { by: "n", desc: true, limit: ENDPOINT_OPTIONS }, ...one }),
    groupNeed("req.svc", "req.svc", "cur"),
    seriesNeed("trend", "err.s", "cur", TREND_BUCKETS, { split: true }),
    seriesNeed("chart", "err", "cur", CHART_BUCKETS, one),
    seriesNeed("chart.prev", "err", "prev", CHART_BUCKETS, one),
    seriesNeed("sparks", "err", "cur", SPARK_BUCKETS, one),
    seriesNeed("rate", "req", "cur", SPARK_BUCKETS, one),
  ];
}

/** Groups the endpoint and user filters allow (both, when both are set); undefined for all. */
function onlyKeys(f: ErrorFilter, first: NeedResults): string[] | undefined {
  const byEndpoint = f.endpoint ? endpointGroupKeys(first) : undefined;
  const byUser = f.user ? rowsOf(first, "user.groups").map((r) => splitKey(r.key)[0]!) : undefined;
  if (byEndpoint && byUser) return byEndpoint.filter((k) => byUser.includes(k));
  return byEndpoint ?? byUser;
}

/** The `group` parameter's group by key, so a link to an older or busier group than the list holds still opens it. */
const selectedNeeds = (group: string | undefined) => (group ? [groupNeed("selected", "err.g", "cur", { top: true, ids: true, filter: { keys: [group] } })] : []);

/** The Errors page. Params: the filter (`errorFilterOf`), page, size, and group (the selected group's key). */
export const errorsPage: PageDef<ErrorsModel> = {
  needs: (ctx) => {
    const f = errorFilterOf(ctx.params);
    const endpoint = f.endpoint ? [endpointGroupsNeed(f.endpoint)] : [];
    const releases = f.service ? [releasesNeed("rel.svc", f.service)] : [];
    const user = f.user ? [groupNeed("user.groups", "err.u", "cur", { filter: { parts: [null, f.user] }, order: { by: "n", desc: true, limit: 5000 } })] : [];
    return uniqueNeeds([...selectedNeeds(ctx.params.group), ...pageNeeds(f.service || undefined), lifeNeed(f.service), ...endpoint, ...releases, ...user]);
  },
  // The list comes second: the status, "new", and endpoint filters pick its keys from the first answers.
  followUp(ctx, first) {
    const f = errorFilterOf(ctx.params);
    const bounds = firstSeenBounds(first, "rel.svc", f.release, f.fresh ? ctx.window.from : null);
    return [errorListNeed(f, ctx.params, issueKeys(ctx, first, f.status, bounds, onlyKeys(f, first)))];
  },
  model(d) {
    const cards = cardsOf(d, "cur");
    const endpoints = endpointsByGroup(rowsOf(d, "err.ge"));
    const chart = seriesOf(d, "chart", CHART_BUCKETS);
    const sparks = seriesOf(d, "sparks", SPARK_BUCKETS);
    return {
      meta: metaOf(d),
      hasRequests: totalOf(d, "req.cur").n > 0,
      exceptions: cards.exceptions,
      filter: errorFilterOf(d.params),
      groups: rowsOf(d, "groups").map((r) => errorGroupOf(r, endpoints)),
      groupCount: groupCount(d, "groups"),
      ...pageParams(d.params, ERROR_PAGE_SIZE),
      endpoints: rowsOf(d, "endpoints").map((r) => ({ endpoint: r.key, count: r.agg.n })),
      issues: issueInfos(d, [...rowsOf(d, "groups"), ...rowsOf(d, "selected")].map((r) => r.key)),
      hasIssues: !!d.issues,
      releases: releasesOf(d, "rel.svc").map((r) => ({ version: r.version, firstMs: r.firstMs })),
      selected: rowsOf(d, "selected").map((r) => errorGroupOf(r, endpoints))[0] ?? null,
      types: [...rowsOf(d, "err.t")].sort(byDesc((r) => r.agg.n)).map((r) => ({ type: r.key, count: r.agg.n })),
      services: servicesOf(d),
      starts: bucketStarts(d.window, CHART_BUCKETS),
      chart: { plain: chart.map((a) => a.n - (a.c[0] ?? 0)), critical: counter(chart, 0), prev: counts(seriesOf(d, "chart.prev", CHART_BUCKETS)) },
      cards,
      change: changeOf(d, cards),
      sparks: { exceptions: counts(sparks), errorRate: seriesOf(d, "rate", SPARK_BUCKETS).map((a) => (a.n ? (a.err / a.n) * 100 : null)), critical: counter(sparks, 0) },
    };
  },
};
