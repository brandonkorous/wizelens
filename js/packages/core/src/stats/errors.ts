import { errorInfo } from "../analysis.js";
import { ATTR_BROWSER_ROUTE, ATTR_ERROR_FRAME, ATTR_SERVICE_VERSION, browserTypeOf } from "../attributes.js";
import { isErrorSpan } from "../trace.js";
import type { Span, Trace } from "../types.js";
import { groupBy, memoByObject, percentOf } from "./common.js";
import { isFailed, type RequestRow, requestOf } from "./requests.js";

/** One error: a span with an exception, or a failed span without one. */
export interface ErrorEvent {
  /** Group key: service, type, and message shape; browser errors add their first app frame after source maps. */
  key: string;
  traceId: string;
  spanId: string;
  timeMs: number;
  type: string;
  message: string;
  stack: string | null;
  /** Service name; browser errors show as "Web App". */
  service: string;
  endpoint: string;
  method: string | null;
  path: string | null;
  status: number | null;
  /** The request failed with a 5xx, or a critical log line was written. */
  critical: boolean;
  browser: boolean;
  /** Browser errors: the first app frame after source maps ("src/App.tsx:checkout"), or null. */
  frame: string | null;
  /** The app version that sent it (service.version), or null. */
  release: string | null;
  userAgent: string | null;
  user: string | null;
  tags: string[];
}

/** How the dashboard names the browser's service. */
export const WEB_APP = "Web App";

export const displayService = (service: string): string => (service === "browser" ? WEB_APP : service);

/** The service name as spans carry it, from its display name. */
export const rawService = (service: string): string => (service === WEB_APP ? "browser" : service);

/** Message with ids and numbers replaced, so the same error with other values groups together. */
export function messageShape(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "{id}")
    .replace(/\b[0-9a-f]{16,}\b/gi, "{id}")
    .replace(/\d+/g, "#")
    .trim();
}

/** Error spans worth showing: exceptions first; plain failed spans only when the trace has no exception. */
function errorSpans(trace: Trace): Span[] {
  const failed = trace.spans.filter(isErrorSpan);
  const withException = failed.filter((s) => s.events.some((e) => e.name === "exception"));
  return withException.length ? withException : failed;
}

const textAttr = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Service, type, and message shape; a browser error's group frame splits errors with the same message thrown in other places. */
export const errorKeyOf = (service: string, type: string, message: string, frame: string | null): string =>
  `${service}|${type}|${messageShape(message)}${frame ? `|${frame}` : ""}`;

function eventOf(trace: Trace, span: Span, row: RequestRow | null, critical: boolean): ErrorEvent {
  const info = errorInfo(span);
  const type = info.type ?? (span.statusMessage?.startsWith("HTTP") ? "HttpError" : "Error");
  const service = displayService(span.service);
  const browser = browserTypeOf(span) !== null;
  const route = span.attributes[ATTR_BROWSER_ROUTE];
  const ex = span.events.find((e) => e.name === "exception");
  const frame = browser ? textAttr(ex?.attributes[ATTR_ERROR_FRAME]) : null;
  return {
    key: errorKeyOf(service, type, info.message, frame),
    traceId: trace.traceId,
    spanId: span.spanId,
    timeMs: ex?.timeMs ?? span.startMs + span.durationMs,
    type,
    message: info.message,
    stack: info.stack,
    service,
    endpoint: row?.endpoint ?? (typeof route === "string" ? route : trace.rootName),
    method: row?.method ?? null,
    path: row?.path ?? (typeof route === "string" ? route : null),
    status: row?.status ?? null,
    critical,
    browser,
    frame,
    release: textAttr(span.attributes[ATTR_SERVICE_VERSION]),
    userAgent: row?.userAgent ?? null,
    user: row?.user ?? null,
    tags: row?.tags ?? [],
  };
}

function eventsOf(trace: Trace): ErrorEvent[] {
  const spans = errorSpans(trace);
  if (spans.length === 0) return [];
  const row = requestOf(trace);
  const critical = ((row?.status ?? 0) >= 500 && row?.expected !== true) || trace.logs.some((l) => l.level === "critical");
  return spans.map((s) => eventOf(trace, s, row, critical));
}

const eventsOfTrace = memoByObject(eventsOf);

/** Every error in the traces, newest first. */
export const errorEvents = (traces: readonly Trace[]): ErrorEvent[] => traces.flatMap(eventsOfTrace).sort((a, b) => b.timeMs - a.timeMs);

/** The same error seen one or more times. */
export interface ErrorGroup {
  key: string;
  type: string;
  message: string;
  service: string;
  endpoint: string;
  count: number;
  firstSeenMs: number;
  lastSeenMs: number;
  critical: boolean;
  /** Newest occurrence. */
  latest: ErrorEvent;
  endpoints: string[];
  traceIds: string[];
}

/** Groups, newest first. `events` must be newest first. */
export function errorGroups(events: readonly ErrorEvent[]): ErrorGroup[] {
  return [...groupBy(events, (e) => e.key)].map(([key, list]) => {
    const latest = list[0]!;
    return {
      key,
      type: latest.type,
      message: latest.message,
      service: latest.service,
      endpoint: latest.endpoint,
      count: list.length,
      firstSeenMs: list[list.length - 1]!.timeMs,
      lastSeenMs: latest.timeMs,
      critical: list.some((e) => e.critical),
      latest,
      endpoints: [...new Set(list.map((e) => e.endpoint))],
      traceIds: [...new Set(list.map((e) => e.traceId))],
    };
  });
}

/** Exception types by count, most frequent first. */
export function errorTypeCounts(events: readonly ErrorEvent[]): { type: string; count: number }[] {
  return [...groupBy(events, (e) => e.type)].map(([type, list]) => ({ type, count: list.length })).sort((a, b) => b.count - a.count);
}

export interface ServiceErrors {
  service: string;
  exceptions: number;
  requests: number;
  /** Failed requests of the service as a percent of its requests. */
  errorRate: number;
}

// A request counts for every service it touched, so a browser fetch that never reached the server does not skew the rate.
const touched = (r: RequestRow, service: string) => displayService(r.service) === service || r.services.some((s) => displayService(s) === service);

/** Errors per service, with the error rate of the requests it took part in. Most errors first. */
export function errorsByService(events: readonly ErrorEvent[], requests: readonly RequestRow[]): ServiceErrors[] {
  const names = new Set([...events.map((e) => e.service), ...requests.flatMap((r) => [r.service, ...r.services].map(displayService))]);
  return [...names]
    .map((service) => {
      const reqs = requests.filter((r) => touched(r, service));
      return { service, exceptions: events.filter((e) => e.service === service).length, requests: reqs.length, errorRate: percentOf(reqs.filter(isFailed).length, reqs.length) };
    })
    .filter((s) => s.exceptions > 0 || s.requests > 0)
    .sort((a, b) => b.exceptions - a.exceptions || b.requests - a.requests);
}

/** Failed requests as a percent of all requests. */
export const errorRateOf = (requests: readonly RequestRow[]): number => percentOf(requests.filter(isFailed).length, requests.length);
