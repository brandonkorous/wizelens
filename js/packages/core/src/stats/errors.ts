import { errorInfo } from "../analysis.js";
import { ATTR_BROWSER_ROUTE, ATTR_ERROR_FRAME, ATTR_SERVICE_VERSION, browserTypeOf } from "../attributes.js";
import { isBotRequest } from "../bots.js";
import { errorSpansOf } from "../trace.js";
import { isUptimeSpan } from "../uptime/check.js";
import { shownServices, spanServiceName } from "../web-app.js";
import type { Span, Trace } from "../types.js";
import { groupBy, memoByObject, percentOf } from "./common.js";
import { errorKeyOf, httpErrorKeyOf, httpStatusOf } from "./error-keys.js";
import { isThirdPartyError } from "./third-party.js";
import { isFailed, type RequestRow, requestOf } from "./requests.js";

/** One error: a span with an exception, or a failed span without one. */
export interface ErrorEvent {
  /** Group key: service, type, and message shape (browser errors add their first app frame); HTTP status failures use status and endpoint. */
  key: string;
  traceId: string;
  spanId: string;
  timeMs: number;
  type: string;
  message: string;
  stack: string | null;
  /** Service name; browser errors show by their app ("shop (browser)"), else as "Web App". */
  service: string;
  endpoint: string;
  method: string | null;
  path: string | null;
  status: number | null;
  /** The request failed with a 5xx, or a critical log line was written; never for a third-party browser error or a bot. */
  critical: boolean;
  /** The request came from a bot or scanner (user agent, or a path such as /.env). */
  bot: boolean;
  browser: boolean;
  /** Browser errors: the first app frame after source maps ("src/App.tsx:checkout"), or null. */
  frame: string | null;
  /** The app version that sent it (service.version), or null. */
  release: string | null;
  userAgent: string | null;
  user: string | null;
  tags: string[];
}

export { displayService, isWebAppName, rawService, spanServiceName, WEB_APP, webAppName } from "../web-app.js";

/** Error spans worth showing: exceptions first; plain failed spans only when the trace has no exception. Uptime runs are not app errors. */
function errorSpans(trace: Trace): Span[] {
  const failed = errorSpansOf(trace.spans).filter((s) => !isUptimeSpan(s));
  const withException = failed.filter((s) => s.events.some((e) => e.name === "exception"));
  return withException.length ? withException : failed;
}

const textAttr = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function eventOf(trace: Trace, span: Span, row: RequestRow | null, critical: boolean, bot: boolean): ErrorEvent {
  const info = errorInfo(span);
  const type = info.type ?? (span.statusMessage?.startsWith("HTTP") ? "HttpError" : "Error");
  const service = spanServiceName(span);
  const browser = browserTypeOf(span) !== null;
  const route = span.attributes[ATTR_BROWSER_ROUTE];
  const ex = span.events.find((e) => e.name === "exception");
  const frame = browser ? textAttr(ex?.attributes[ATTR_ERROR_FRAME]) : null;
  const endpoint = row?.endpoint ?? (typeof route === "string" ? route : trace.rootName);
  const thirdParty = browser && isThirdPartyError(span, info.stack);
  const httpStatus = !ex && type === "HttpError" ? (httpStatusOf(span.statusMessage) ?? row?.status ?? null) : null;
  return {
    key: httpStatus !== null ? httpErrorKeyOf(service, httpStatus, endpoint) : errorKeyOf(service, type, info.message, frame),
    traceId: trace.traceId,
    spanId: span.spanId,
    timeMs: ex?.timeMs ?? span.startMs + span.durationMs,
    type,
    message: info.message,
    stack: info.stack,
    service,
    endpoint,
    method: row?.method ?? null,
    path: row?.path ?? (typeof route === "string" ? route : null),
    status: row?.status ?? null,
    critical: critical && !thirdParty && !bot,
    bot,
    browser,
    frame,
    release: textAttr(span.attributes[ATTR_SERVICE_VERSION]),
    userAgent: row?.userAgent ?? textAttr(span.attributes["user_agent.original"]),
    user: row?.user ?? null,
    tags: thirdParty ? [...(row?.tags ?? []), "third-party"] : (row?.tags ?? []),
  };
}

function eventsOf(trace: Trace): ErrorEvent[] {
  const spans = errorSpans(trace);
  if (spans.length === 0) return [];
  const row = requestOf(trace);
  const critical = ((row?.status ?? 0) >= 500 && row?.expected !== true) || trace.logs.some((l) => l.level === "critical");
  const bot = row ? isBotRequest(row) : false;
  return spans.map((s) => eventOf(trace, s, row, critical, bot));
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
  /** Occurrences from bots and scanners; a group of only those is "bot-only". */
  bots: number;
  /** Newest occurrence. */
  latest: ErrorEvent;
  endpoints: string[];
  traceIds: string[];
}

/** A group seen only from bots and scanners: not critical, and named "bot-only" so it does not read as a real failure. */
export const isBotOnly = (g: Pick<ErrorGroup, "bots" | "count">): boolean => g.bots > 0 && g.bots >= g.count;

/** The word a group's badge shows: critical, bot-only, or plain error. */
export const errorGroupLabel = (g: Pick<ErrorGroup, "bots" | "count" | "critical">): string => (g.critical ? "Critical" : isBotOnly(g) ? "Bot-only" : "Error");

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
      bots: list.filter((e) => e.bot).length,
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
const touched = (r: RequestRow, service: string) => shownServices([r.service, ...r.services], r.app).includes(service);

/** Errors per service, with the error rate of the requests it took part in. Most errors first. */
export function errorsByService(events: readonly ErrorEvent[], requests: readonly RequestRow[]): ServiceErrors[] {
  const names = new Set([...events.map((e) => e.service), ...requests.flatMap((r) => shownServices([r.service, ...r.services], r.app))]);
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
