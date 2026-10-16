import { avgOf, bucketStarts, percentChange, percentOf, series, sumOf, type TimeWindow } from "./common.js";
import { isFailed, type RequestRow } from "./requests.js";

/** One headline number with its value in the previous window and a trend series. */
export interface Headline {
  value: number | null;
  previous: number | null;
  /** Percent change against the previous window. Null when there is nothing to compare. */
  change: number | null;
  series: (number | null)[];
}

export interface RequestHeadlines {
  total: Headline;
  avgDuration: Headline;
  sqlQueries: Headline;
  errorRate: Headline;
  insights: Headline;
}

export const SPARK_BUCKETS = 24;
export const ACTIVITY_BUCKETS = 48;

function headline(value: number | null, previous: number | null, trend: (number | null)[]): Headline {
  return { value, previous, change: percentChange(value, previous), series: trend };
}

const avgDuration = (rows: readonly RequestRow[]) => avgOf(rows.map((r) => r.durationMs));
const sqlCount = (rows: readonly RequestRow[]) => sumOf(rows.map((r) => r.dbCount));
const insightCount = (rows: readonly RequestRow[]) => sumOf(rows.map((r) => r.insights));
const errorRate = (rows: readonly RequestRow[]) => (rows.length ? percentOf(rows.filter(isFailed).length, rows.length) : null);
const time = (r: RequestRow) => r.startMs;

/** Error rate per bucket in percent. Empty buckets are null. */
function errorRateSeries(rows: readonly RequestRow[], w: TimeWindow, buckets: number): (number | null)[] {
  const all = series(rows, time, w, buckets);
  const failed = series(rows.filter(isFailed), time, w, buckets);
  return all.map((n, i) => (n ? percentOf(failed[i] ?? 0, n) : null));
}

/** The headline cards for a window of requests, compared with the window before it. */
export function requestHeadlines(rows: readonly RequestRow[], prevRows: readonly RequestRow[], w: TimeWindow, buckets = SPARK_BUCKETS): RequestHeadlines {
  const hadPrevious = prevRows.length > 0;
  const prev = <T>(v: T): T | null => (hadPrevious ? v : null);
  return {
    total: headline(rows.length, prev(prevRows.length), series(rows, time, w, buckets)),
    avgDuration: headline(avgDuration(rows), prev(avgDuration(prevRows)), series(rows, time, w, buckets, "avg", (r) => r.durationMs)),
    sqlQueries: headline(sqlCount(rows), prev(sqlCount(prevRows)), series(rows, time, w, buckets, "sum", (r) => r.dbCount)),
    errorRate: headline(errorRate(rows), prev(errorRate(prevRows)), errorRateSeries(rows, w, buckets)),
    insights: headline(insightCount(rows), prev(insightCount(prevRows)), series(rows, time, w, buckets, "sum", (r) => r.insights)),
  };
}

export interface ActivitySeries {
  starts: number[];
  requests: (number | null)[];
  errors: (number | null)[];
}

/** Requests and failed requests per bucket, for the activity chart. */
export function requestActivity(rows: readonly RequestRow[], w: TimeWindow, buckets = ACTIVITY_BUCKETS): ActivitySeries {
  return {
    starts: bucketStarts(w, buckets),
    requests: series(rows, time, w, buckets),
    errors: series(rows.filter(isFailed), time, w, buckets),
  };
}

/** Average time per part of a request. Null parts have no data in the window. */
export interface TimingBreakdown {
  request: number | null;
  server: number | null;
  database: number | null;
  render: number | null;
  network: number | null;
}

const avgKnown = (values: (number | null)[]) => avgOf(values.filter((v): v is number => v !== null));

export function timingBreakdown(rows: readonly RequestRow[]): TimingBreakdown {
  const withServer = rows.filter((r) => r.serverMs !== null);
  return {
    request: avgDuration(rows),
    server: avgKnown(rows.map((r) => r.serverMs)),
    database: withServer.length ? avgOf(withServer.map((r) => r.dbMs)) : null,
    render: avgKnown(rows.map((r) => r.renderMs)),
    network: avgKnown(rows.map((r) => r.networkMs)),
  };
}
