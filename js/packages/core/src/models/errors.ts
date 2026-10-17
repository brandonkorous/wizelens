import { splitKey } from "../scale/kinds.js";
import type { NeedResults, PageData, PageDef, WindowRef } from "../scale/needs.js";
import { bucketStarts, percentChange, percentOf } from "../stats/common.js";
import { displayService, type ErrorEvent, type ErrorGroup, type ServiceErrors } from "../stats/errors.js";
import { SPARK_BUCKETS } from "../stats/overview.js";
import { CHART_BUCKETS, MODEL_LIST_MAX } from "./database.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
import { aggByKey, byDesc, counter, counts, groupCount, groupNeed, type Row, rowsOf, type Series, seriesNeed, seriesOf, totalOf, uniqueNeeds } from "./read.js";

export interface ServiceErrorRow extends ServiceErrors {
  prevExceptions: number;
  trend: Series;
}

export interface ErrorsModel {
  meta: ModelMeta;
  hasRequests: boolean;
  exceptions: number;
  groups: ErrorGroup[];
  types: { type: string; count: number }[];
  services: ServiceErrorRow[];
  starts: number[];
  chart: { plain: Series; critical: Series };
  cards: { exceptions: number; errorRate: number; endpoints: number; critical: number };
  change: { exceptions: number | null; errorRate: number | null; endpoints: number | null; critical: number | null };
  sparks: { exceptions: Series; errorRate: Series; critical: Series };
}

const TREND_BUCKETS = 16;
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

function groupOf({ key, agg }: Row, endpoints: Map<string, string[]>): ErrorGroup {
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

const windowNeeds = (win: WindowRef) => [
  groupNeed(`req.${win}`, "req", win),
  groupNeed(`err.${win}`, "err", win),
  groupNeed(`err.g.${win}`, "err.g", win),
  groupNeed(`err.e.${win}`, "err.e", win, { order: { by: "n", desc: true, limit: 0 } }),
  groupNeed(`err.s.${win}`, "err.s", win),
];

/** The Errors page. */
export const errorsPage: PageDef<ErrorsModel> = {
  needs: () =>
    uniqueNeeds([
      ...META_NEEDS,
      ...windowNeeds("cur"),
      ...windowNeeds("prev"),
      groupNeed("groups", "err.g", "cur", { top: true, ids: true, order: { by: "lastMs", desc: true, limit: MODEL_LIST_MAX } }),
      groupNeed("err.ge", "err.ge", "cur"),
      groupNeed("err.t", "err.t", "cur"),
      groupNeed("req.svc", "req.svc", "cur"),
      seriesNeed("trend", "err.s", "cur", TREND_BUCKETS, { split: true }),
      seriesNeed("chart", "err", "cur", CHART_BUCKETS),
      seriesNeed("sparks", "err", "cur", SPARK_BUCKETS),
      seriesNeed("rate", "req", "cur", SPARK_BUCKETS),
    ]),
  model(d) {
    const cards = cardsOf(d, "cur");
    const endpoints = endpointsByGroup(rowsOf(d, "err.ge"));
    const chart = seriesOf(d, "chart", CHART_BUCKETS);
    const sparks = seriesOf(d, "sparks", SPARK_BUCKETS);
    return {
      meta: metaOf(d),
      hasRequests: totalOf(d, "req.cur").n > 0,
      exceptions: cards.exceptions,
      groups: [...rowsOf(d, "groups")].sort(byDesc((r) => r.agg.lastMs)).map((r) => groupOf(r, endpoints)),
      types: [...rowsOf(d, "err.t")].sort(byDesc((r) => r.agg.n)).map((r) => ({ type: r.key, count: r.agg.n })),
      services: servicesOf(d),
      starts: bucketStarts(d.window, CHART_BUCKETS),
      chart: { plain: chart.map((a) => a.n - (a.c[0] ?? 0)), critical: counter(chart, 0) },
      cards,
      change: changeOf(d, cards),
      sparks: { exceptions: counts(sparks), errorRate: seriesOf(d, "rate", SPARK_BUCKETS).map((a) => (a.n ? (a.err / a.n) * 100 : null)), critical: counter(sparks, 0) },
    };
  },
};
