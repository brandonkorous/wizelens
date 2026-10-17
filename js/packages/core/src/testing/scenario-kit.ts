// Deterministic span builders for the scenario traces. Test-only: excluded from the build.
import { ATTR_BROWSER_RENDER_MS, ATTR_BROWSER_ROUTE, ATTR_BROWSER_TYPE, ATTR_REQUEST_ABORTED, ATTR_REQUEST_ID, ATTR_ROUTED_MS, TAG_PREFIX } from "../attributes.js";
import { buildTrace } from "../trace.js";
import type { Attributes, LogLevel, LogRecord, Span, SpanEvent, Trace } from "../types.js";

export interface Draft {
  traceId: string;
  spans: Span[];
  logs: LogRecord[];
}

export const draft = (traceId: string): Draft => ({ traceId, spans: [], logs: [] });

/** Trace id from the anchor and the builder, so every run builds the same ids. */
export const traceIdOf = (anchor: number, type: number): string => `5c${anchor.toString(16).padStart(3, "0")}${type.toString(16).padStart(3, "0")}`.padEnd(32, "e");

/** Add a span. Span ids are the trace id's tail and a counter. */
export function span(d: Draft, s: Partial<Span> & Pick<Span, "category" | "startMs" | "durationMs">): Span {
  const spanId = `${d.traceId.slice(0, 8)}${(d.spans.length + 1).toString(16).padStart(8, "0")}`;
  const full: Span = { traceId: d.traceId, spanId, parentSpanId: null, name: s.category, kind: "internal", service: "api", status: "unset", statusMessage: null, attributes: {}, events: [], ...s };
  d.spans.push(full);
  return full;
}

export function log(d: Draft, timeMs: number, level: LogLevel, message: string, service: string, spanId: string | null = null, attributes: Attributes = {}): void {
  d.logs.push({ timeMs, level, category: `${service}.app`, message, service, spanId, attributes });
}

export function exception(type: string, message: string, timeMs: number): SpanEvent[] {
  return [{ name: "exception", timeMs, attributes: { "exception.type": type, "exception.message": message, "exception.stacktrace": `${type}: ${message}\n    at handler (app.ts:12:3)` } }];
}

export const finish = (d: Draft): Trace => buildTrace(d.traceId, d.spans, d.logs, []);

export interface ServerOptions {
  at: number;
  ms: number;
  path: string;
  method?: string;
  route?: string;
  status?: number | null;
  service?: string;
  parent?: string | null;
  error?: { type: string; message: string };
  user?: string;
  extra?: Attributes;
}

/** An http.server span, with the request attributes the Requests page shows. */
export function server(d: Draft, o: ServerOptions): Span {
  const status = o.status === undefined ? 200 : o.status;
  const attributes: Attributes = {
    "http.request.method": o.method ?? "GET",
    "url.path": o.path,
    ...(status === null ? {} : { "http.response.status_code": status }),
    ...(o.route ? { "http.route": o.route } : {}),
    "user_agent.original": "Mozilla/5.0 (scenario)",
    "client.address": "10.0.0.7",
    ...(o.user ? { "enduser.id": o.user } : {}),
    [ATTR_REQUEST_ID]: `req-${d.traceId.slice(2, 8)}`,
    [ATTR_ROUTED_MS]: 2,
    ...o.extra,
  };
  const failed = !!o.error || (status ?? 0) >= 500;
  const name = `${o.method ?? "GET"} ${o.route ?? o.path}`;
  const events = o.error ? exception(o.error.type, o.error.message, o.at + o.ms - 1) : [];
  return span(d, { category: "http.server", kind: "server", service: o.service ?? "api", startMs: o.at, durationMs: o.ms, name, status: failed ? "error" : "unset", parentSpanId: o.parent ?? null, attributes, events });
}

export interface QueryOptions {
  system?: string;
  ns?: string;
  params?: string;
  rows?: number;
  table?: string;
  error?: string;
}

/** A db span under `parent`, in the parent's service. */
export function query(d: Draft, parent: Span, at: number, ms: number, sql: string, o: QueryOptions = {}): Span {
  const attributes: Attributes = { "db.system.name": o.system ?? "sqlite", "db.query.text": sql };
  if (o.ns) attributes["db.namespace"] = o.ns;
  if (o.params) attributes["wizelens.db.parameters"] = o.params;
  if (o.rows !== undefined) attributes["db.response.returned_rows"] = o.rows;
  if (o.table) attributes["db.collection.name"] = o.table;
  const status = o.error ? "error" : "unset";
  return span(d, { category: "db", kind: "client", service: parent.service, parentSpanId: parent.spanId, startMs: at, durationMs: ms, name: sql.split(" ")[0], status, statusMessage: o.error ?? null, attributes });
}

/** A browser fetch span; `renderMs` is the time to the next paint. */
export function fetchSpan(d: Draft, o: { at: number; ms: number; url: string; method?: string; status?: number; renderMs?: number; route?: string }): Span {
  const attributes: Attributes = { [ATTR_BROWSER_TYPE]: "fetch", "http.request.method": o.method ?? "GET", "url.full": o.url, "http.response.status_code": o.status ?? 200 };
  if (o.renderMs !== undefined) attributes[ATTR_BROWSER_RENDER_MS] = o.renderMs;
  if (o.route) attributes[ATTR_BROWSER_ROUTE] = o.route;
  return span(d, { category: "browser", kind: "client", service: "browser", startMs: o.at, durationMs: o.ms, name: `fetch ${o.url}`, attributes });
}

/** An outbound http.client span. */
export function client(d: Draft, parent: Span, at: number, ms: number, url: string, method = "GET", status = 200): Span {
  const attributes: Attributes = { "http.request.method": method, "url.full": url, "http.response.status_code": status };
  return span(d, { category: "http.client", kind: "client", service: parent.service, parentSpanId: parent.spanId, startMs: at, durationMs: ms, name: `${method} ${url}`, attributes });
}

export const tag = (name: string, value: string | true): Attributes => ({ [`${TAG_PREFIX}${name}`]: value });

export const aborted: Attributes = { [ATTR_REQUEST_ABORTED]: true };
