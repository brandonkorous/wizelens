import { bucketStarts, percentChange, series, type TimeWindow } from "../stats/common.js";
import { type ErrorEvent, errorEvents, errorGroups, type ErrorGroup, errorRateOf, errorsByService, errorTypeCounts, type ServiceErrors } from "../stats/errors.js";
import { isFailed, type RequestRow } from "../stats/requests.js";
import { SPARK_BUCKETS } from "../stats/overview.js";
import { CHART_BUCKETS, MODEL_LIST_MAX } from "./database.js";
import { type ModelInput, type ModelMeta, metaOf } from "./input.js";

type Series = (number | null)[];

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
const count = (events: readonly ErrorEvent[], w: TimeWindow, buckets: number) => series(events, (e) => e.timeMs, w, buckets);

/** Failed requests per bucket as a percent of requests in that bucket. */
function rateSeries(requests: readonly RequestRow[], w: TimeWindow): Series {
  const all = series(requests, (r) => r.startMs, w, SPARK_BUCKETS);
  const failed = series(requests.filter(isFailed), (r) => r.startMs, w, SPARK_BUCKETS);
  return all.map((n, i) => (n ? ((failed[i] ?? 0) / n) * 100 : null));
}

function cardNumbers(events: readonly ErrorEvent[], requests: readonly RequestRow[]) {
  return {
    exceptions: events.length,
    errorRate: errorRateOf(requests),
    endpoints: new Set(events.map((e) => e.endpoint)).size,
    critical: errorGroups(events).filter((g) => g.critical).length,
  };
}

/** Groups keep at most 50 trace ids each, so the model stays small over long ranges. */
const trimGroup = (g: ErrorGroup): ErrorGroup => ({ ...g, traceIds: g.traceIds.slice(0, 50), endpoints: g.endpoints.slice(0, 50) });

function serviceRows(events: readonly ErrorEvent[], prevEvents: readonly ErrorEvent[], i: ModelInput): ServiceErrorRow[] {
  return errorsByService(events, i.requests).map((s) => ({
    ...s,
    prevExceptions: prevEvents.filter((e) => e.service === s.service).length,
    trend: count(events.filter((e) => e.service === s.service), i.window, TREND_BUCKETS),
  }));
}

/** The Errors page. */
export function errorsModel(i: ModelInput): ErrorsModel {
  const events = errorEvents(i.traces);
  const prevEvents = errorEvents(i.prevTraces);
  const cards = cardNumbers(events, i.requests);
  const prev = cardNumbers(prevEvents, i.prevRequests);
  const hasPrev = i.prevTraces.length > 0;
  const change = (a: number, b: number) => (hasPrev ? percentChange(a, b) : null);
  return {
    meta: metaOf(i),
    hasRequests: i.requests.length > 0,
    exceptions: events.length,
    groups: errorGroups(events).slice(0, MODEL_LIST_MAX).map(trimGroup),
    types: errorTypeCounts(events),
    services: serviceRows(events, prevEvents, i),
    starts: bucketStarts(i.window, CHART_BUCKETS),
    chart: { plain: count(events.filter((e) => !e.critical), i.window, CHART_BUCKETS), critical: count(events.filter((e) => e.critical), i.window, CHART_BUCKETS) },
    cards,
    change: {
      exceptions: change(cards.exceptions, prev.exceptions),
      errorRate: change(cards.errorRate, prev.errorRate),
      endpoints: change(cards.endpoints, prev.endpoints),
      critical: change(cards.critical, prev.critical),
    },
    sparks: { exceptions: count(events, i.window, SPARK_BUCKETS), errorRate: rateSeries(i.requests, i.window), critical: count(events.filter((e) => e.critical), i.window, SPARK_BUCKETS) },
  };
}
