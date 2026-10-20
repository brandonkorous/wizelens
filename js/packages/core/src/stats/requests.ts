import { ANALYSIS_DEFAULTS, pathShape, analyzeTrace, type AnalysisOptions, type Finding } from "../analysis.js";
import { ATTR_ENDUSER, ATTR_REQUEST_ABORTED, ATTR_REQUEST_ID, ATTR_USER_NAME, ATTR_RPC, browserTypeOf, TAG_PREFIX } from "../attributes.js";
import { busyMs } from "../busy.js";
import { REDACTED } from "../redact.js";
import { type Health, healthOf, insightsOf, traceTiming } from "../health.js";
import { entryServerSpan, isErrorSpan } from "../trace.js";
import type { Span, Trace } from "../types.js";
import { memoByObject } from "./common.js";

/** One request (a trace with a server span or a browser fetch), ready for tables and charts. */
export interface RequestRow {
  traceId: string;
  /** The project's label, when one read covers many projects (the cloud's "All projects"). */
  project?: string;
  startMs: number;
  method: string;
  /** Path with the query, as called. */
  path: string;
  /** Method and route shape, for grouping: "GET /api/orders/{}". */
  endpoint: string;
  status: number | null;
  /** True when the client left before the server answered. */
  aborted: boolean;
  /** Request start to the next paint when the browser measured it, else the trace duration. */
  durationMs: number;
  serverMs: number | null;
  dbMs: number;
  dbCount: number;
  fetchCount: number;
  fetchMs: number;
  renderMs: number | null;
  /** Browser round trip minus server time. Null without both. */
  networkMs: number | null;
  /** Service of the first server span, else "browser". */
  service: string;
  services: string[];
  errors: number;
  findings: Finding[];
  insights: number;
  health: Health;
  userAgent: string | null;
  clientAddress: string | null;
  user: string | null;
  requestId: string | null;
  tags: string[];
}

const str = (span: Span | undefined, key: string): string | null => {
  const v = span?.attributes[key];
  return v === undefined || v === null || v === "" ? null : String(v);
};

/** The span that names the user: the server span, else any span of the trace that has one (a browser span). */
const userSpan = (trace: Trace, server: Span | undefined): Span | undefined =>
  server?.attributes[ATTR_ENDUSER] != null ? server : trace.spans.find((s) => s.attributes[ATTR_ENDUSER] != null);

/** The user's display name (`user.full_name`, else `user.name`), from the span that names the user; null when missing or redacted. Only the Users page keeps it. */
export function requestUserName(trace: Trace): string | null {
  const span = userSpan(trace, entryServerSpan(trace.spans));
  const name = str(span, ATTR_USER_NAME) ?? str(span, "user.name");
  return name === null || name === REDACTED ? null : name.slice(0, 200);
}

const byStart = (a: Span, b: Span) => a.startMs - b.startMs;

/** Tags as "key" or "key:value". */
export function tagsOf(span: Span | undefined): string[] {
  if (!span) return [];
  return Object.entries(span.attributes)
    .filter(([k]) => k.startsWith(TAG_PREFIX))
    .map(([k, v]) => (v === null || v === "" || v === true ? k.slice(TAG_PREFIX.length) : `${k.slice(TAG_PREFIX.length)}:${String(v)}`));
}

function pathOf(server: Span | undefined, fetch: Span | undefined): string {
  const path = str(server, "url.path");
  if (path) {
    const query = str(server, "url.query");
    return query ? `${path}?${query}` : path;
  }
  const full = str(fetch, "url.full");
  if (!full) return server?.name ?? fetch?.name ?? "/";
  try {
    const u = new URL(full);
    return u.pathname + u.search;
  } catch {
    return full;
  }
}

function endpointOf(method: string, server: Span | undefined, path: string): string {
  const route = str(server, "http.route");
  return `${method} ${route ?? pathShape(path)}`;
}

/** Method, path, and endpoint of a request. gRPC calls read "gRPC" and "/{service}/{method}". */
function identityOf(server: Span | undefined, fetch: Span | undefined): { method: string; path: string; endpoint: string } {
  if (str(server, ATTR_RPC.system)) {
    const rpc = `${str(server, ATTR_RPC.service) ?? "service"}/${str(server, ATTR_RPC.method) ?? "method"}`;
    return { method: "gRPC", path: `/${rpc}`, endpoint: `gRPC ${rpc}` };
  }
  const method = (str(server, "http.request.method") ?? str(fetch, "http.request.method") ?? "GET").toUpperCase();
  const path = pathOf(server, fetch);
  return { method, path, endpoint: endpointOf(method, server, path) };
}

function buildRow(trace: Trace, analysis: AnalysisOptions = {}): RequestRow | null {
  const server = entryServerSpan(trace.spans);
  const fetch = trace.spans.filter((s) => browserTypeOf(s) === "fetch").sort(byStart)[0];
  if (!server && !fetch) return null;
  const timing = traceTiming(trace);
  const clients = trace.spans.filter((s) => s.category === "http.client");
  const findings = analyzeTrace(trace, analysis);
  const errors = trace.spans.filter(isErrorSpan).length;
  const insights = insightsOf(findings).length;
  const { method, path, endpoint } = identityOf(server, fetch);
  const who = userSpan(trace, server);
  const statusRaw = server?.attributes["http.response.status_code"] ?? fetch?.attributes["http.response.status_code"];
  const status = typeof statusRaw === "number" ? statusRaw : statusRaw == null ? null : Number(statusRaw) || null;
  return {
    traceId: trace.traceId,
    startMs: fetch?.startMs ?? server?.startMs ?? trace.startMs,
    method,
    path,
    endpoint,
    status,
    aborted: server?.attributes[ATTR_REQUEST_ABORTED] === true,
    durationMs: timing.totalMs,
    serverMs: timing.serverMs,
    dbMs: timing.dbMs,
    dbCount: timing.dbCount,
    fetchCount: clients.length,
    fetchMs: busyMs(clients),
    renderMs: timing.renderMs,
    networkMs: fetch && server ? Math.max(0, fetch.durationMs - server.durationMs) : null,
    service: server?.service ?? "browser",
    services: trace.services,
    errors,
    findings,
    insights,
    health: healthOf({ status, error: errors > 0, totalMs: timing.totalMs, insights }),
    userAgent: str(server, "user_agent.original"),
    clientAddress: str(server, "client.address"),
    user: str(who, ATTR_ENDUSER),
    requestId: str(server, ATTR_REQUEST_ID),
    tags: tagsOf(server),
  };
}

/** The request row of a trace, or null when the trace is not a request (a page view, a job). Cached per trace. */
export const requestOf: (trace: Trace) => RequestRow | null = memoByObject((t: Trace) => buildRow(t));

const withOptions = new WeakMap<Trace, Map<string, RequestRow | null>>();

/** The request row with a project's thresholds; the cached default row when they are the defaults. */
export function requestWith(trace: Trace, o: { slowQueryMs: number; nPlusOneThreshold: number }): RequestRow | null {
  if (o.slowQueryMs === ANALYSIS_DEFAULTS.slowQueryMs && o.nPlusOneThreshold === ANALYSIS_DEFAULTS.nPlusOneThreshold) return requestOf(trace);
  const key = `${o.slowQueryMs}|${o.nPlusOneThreshold}`;
  let byKey = withOptions.get(trace);
  if (!byKey) withOptions.set(trace, (byKey = new Map()));
  if (!byKey.has(key)) byKey.set(key, buildRow(trace, o));
  return byKey.get(key)!;
}

/** Request rows of many traces, newest first. */
export function requestRows(traces: readonly Trace[]): RequestRow[] {
  const rows: RequestRow[] = [];
  for (const t of traces) {
    const row = requestOf(t);
    if (row) rows.push(row);
  }
  return rows.sort((a, b) => b.startMs - a.startMs);
}

export const isFailed = (r: Pick<RequestRow, "errors" | "status">): boolean => r.errors > 0 || (r.status ?? 0) >= 500;
