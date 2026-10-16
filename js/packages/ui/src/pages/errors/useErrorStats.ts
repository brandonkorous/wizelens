import { useMemo } from "react";
import {
  bucketStarts,
  type ErrorEvent,
  errorEvents,
  errorGroups,
  errorRateOf,
  errorsByService,
  errorTypeCounts,
  isFailed,
  percentChange,
  type RequestRow,
  series,
  type TimeWindow,
} from "@wizeworks/lens-core";
import { useWindowed } from "../../data/hooks";

export const CHART_BUCKETS = 48;
export const SPARK_BUCKETS = 24;

const countSeries = (events: readonly ErrorEvent[], w: TimeWindow, buckets: number) => series(events, (e) => e.timeMs, w, buckets);

/** Failed requests per bucket as a percent of requests in that bucket. */
function rateSeries(requests: readonly RequestRow[], w: TimeWindow): (number | null)[] {
  const all = series(requests, (r) => r.startMs, w, SPARK_BUCKETS);
  const failed = series(requests.filter(isFailed), (r) => r.startMs, w, SPARK_BUCKETS);
  return all.map((n, i) => (n ? ((failed[i] ?? 0) / n) * 100 : null));
}

function cardNumbers(events: readonly ErrorEvent[], requests: readonly RequestRow[]) {
  const groups = errorGroups(events);
  return {
    exceptions: events.length,
    errorRate: errorRateOf(requests),
    endpoints: new Set(events.map((e) => e.endpoint)).size,
    critical: groups.filter((g) => g.critical).length,
  };
}

/** Everything the Errors page shows, for the selected time range. */
export function useErrorStats() {
  const w = useWindowed();
  return useMemo(() => {
    const events = errorEvents(w.traces);
    const prevEvents = errorEvents(w.prevTraces);
    const cards = cardNumbers(events, w.requests);
    const prev = cardNumbers(prevEvents, w.prevRequests);
    const hasPrev = w.prevTraces.length > 0;
    const change = (a: number, b: number) => (hasPrev ? percentChange(a, b) : null);
    return {
      w,
      events,
      prevEvents,
      groups: errorGroups(events),
      types: errorTypeCounts(events),
      services: errorsByService(events, w.requests),
      starts: bucketStarts(w.window, CHART_BUCKETS),
      cards,
      change: {
        exceptions: change(cards.exceptions, prev.exceptions),
        errorRate: change(cards.errorRate, prev.errorRate),
        endpoints: change(cards.endpoints, prev.endpoints),
        critical: change(cards.critical, prev.critical),
      },
      sparks: {
        exceptions: countSeries(events, w.window, SPARK_BUCKETS),
        errorRate: rateSeries(w.requests, w.window),
        critical: countSeries(events.filter((e) => e.critical), w.window, SPARK_BUCKETS),
      },
    };
  }, [w]);
}

export type ErrorStats = ReturnType<typeof useErrorStats>;
