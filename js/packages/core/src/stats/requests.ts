import { pathShape, analyzeTrace, type Finding } from "../analysis.js";
import { ATTR_REQUEST_ABORTED, ATTR_REQUEST_ID, ATTR_RPC, browserTypeOf, TAG_PREFIX } from "../attributes.js";
import { busyMs } from "../busy.js";
import { type Health, healthOf, insightsOf, traceTiming } from "../health.js";
import { entryServerSpan, isErrorSpan } from "../trace.js";
import type { Span, Trace } from "../types.js";
import { memoByObject } from "./common.js";

/** One request (a trace with a server span or a browser fetch), ready for tables and charts. */
export interface RequestRow {
  traceId: string;
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

function buildRow(trace: Trace): RequestRow | null {
  const server = entryServerSpan(trace.spans);
  const fetch = trace.spans.filter((s) => browserTypeOf(s) === "fetch").sort(byStart)[0];
  if (!server && !fetch) return null;
  const timing = traceTiming(trace);
  const clients = trace.spans.filter((s) => s.category === "http.client");
  const findings = analyzeTrace(trace);
  const errors = trace.spans.filter(isErrorSpan).length;
  const insights = insightsOf(findings).length;
  const { method, path, endpoint } = identityOf(server, fetch);
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
    user: str(server, "enduser.id"),
    requestId: str(server, ATTR_REQUEST_ID),
    tags: tagsOf(server),
  };
}

/** The request row of a trace, or null when the trace is not a request (a page view, a job). Cached per trace. */
export const requestOf: (trace: Trace) => RequestRow | null = memoByObject(buildRow);

/** Request rows of many traces, newest first. */
export function requestRows(traces: readonly Trace[]): RequestRow[] {
  const rows: RequestRow[] = [];
  for (const t of traces) {
    const row = requestOf(t);
    if (row) rows.push(row);
  }
  return rows.sort((a, b) => b.startMs - a.startMs);
}

export const isFailed = (r: RequestRow): boolean => r.errors > 0 || (r.status ?? 0) >= 500;
