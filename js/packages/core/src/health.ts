import type { Finding } from "./analysis.js";
import { busyMs, busyWithin, totalMs } from "./busy.js";
import { ATTR_BROWSER_RENDER_MS, browserTypeOf } from "./attributes.js";
import { isSecurityKind } from "./security/kinds.js";
import { requestMsOf } from "./stream.js";
import { entryServerSpan } from "./trace.js";
import { type Span, type Trace } from "./types.js";

// Brand guide colors: info blue, success green, opportunity amber, warning orange, critical red, neutral slate.
export type Health = "info" | "success" | "opportunity" | "warning" | "critical" | "neutral";

/** Requests at or over this many ms are "warning". */
export const DEFAULT_SLOW_MS = 500;

export interface HealthInput {
  /** HTTP status. Null when there is no response yet, or no status. */
  status: number | null;
  /** True when the app expected the answer: a 5xx is then not critical. */
  expected?: boolean;
  /** True for a network error, an exception, or an error span. */
  error: boolean;
  /** Full time of the request. Null while it runs. */
  totalMs: number | null;
  /** Number of insights (N+1, duplicate, slow query). Null when not known yet. */
  insights: number | null;
}

export function healthOf(input: HealthInput | null, slowMs = DEFAULT_SLOW_MS): Health {
  if (!input) return "neutral";
  const status = input.status ?? 0;
  if (input.error || (status >= 500 && input.expected !== true)) return "critical";
  if (input.totalMs === null) return "info";
  if (status >= 400 || input.totalMs >= slowMs) return "warning";
  if (input.insights === null) return "info";
  return input.insights > 0 ? "opportunity" : "success";
}

/** Findings that are hints, not errors. */
export const insightsOf = (findings: readonly Finding[]): Finding[] => findings.filter((f) => f.kind !== "error" && !isSecurityKind(f.kind));

export interface Timing {
  /** Request start to the next paint. Without browser data: the trace duration. */
  totalMs: number;
  /** Duration of the first server span. Null when the trace has no server span. */
  serverMs: number | null;
  /** Wall time with a query running, in all services. Queries that run together count once. */
  dbMs: number;
  /** All query durations added up. More than dbMs when queries run together. */
  dbTotalMs: number;
  dbCount: number;
  /** Slowest single query. */
  dbSlowestMs: number;
  /** Time from the response to the next paint. Null when unknown. */
  renderMs: number | null;
  /** Service of the first server span. */
  service: string | null;
  /** First server span, split in parts. Null when the trace has no server span. */
  server: {
    /** Time in the service's own code: not in its own queries or outbound calls. */
    codeMs: number;
    /** Wall time in the service's own queries. */
    dbMs: number;
    /** Wall time in the service's outbound HTTP calls (other services' time is in here). */
    httpOutMs: number;
    httpOutCount: number;
  } | null;
}

const byStart = (a: Span, b: Span) => a.startMs - b.startMs;

/** Where the time of one request went. */
export function traceTiming(trace: Pick<Trace, "spans" | "durationMs">): Timing {
  const browser = trace.spans.filter((s) => browserTypeOf(s) === "fetch").sort(byStart)[0];
  const root = entryServerSpan(trace.spans);
  // A stream's request time is its first byte: the minutes it stays open are not.
  const rootMs = root ? requestMsOf(root) : null;
  const db = trace.spans.filter((s) => s.category === "db");
  const rawRender = browser?.attributes[ATTR_BROWSER_RENDER_MS];
  const renderMs = typeof rawRender === "number" && Number.isFinite(rawRender) ? Math.max(0, rawRender) : null;

  let server: Timing["server"] = null;
  if (root) {
    const own = trace.spans.filter((s) => s.service === root.service);
    const ownDb = own.filter((s) => s.category === "db");
    const out = own.filter((s) => s.category === "http.client");
    // Only time inside the server span counts: an aborted request ends early while its handler keeps running.
    const within = (spans: Span[]) => busyWithin(spans, root.startMs, root.startMs + root.durationMs);
    server = { codeMs: Math.max(0, rootMs! - within([...ownDb, ...out])), dbMs: within(ownDb), httpOutMs: within(out), httpOutCount: out.length };
  }

  return {
    // Without a browser call the request is its entry server span: later spans (a cached page's renders) are not in it.
    totalMs: browser ? browser.durationMs + (renderMs ?? 0) : (rootMs ?? trace.durationMs),
    serverMs: rootMs,
    dbMs: busyMs(db),
    dbTotalMs: totalMs(db),
    dbCount: db.length,
    dbSlowestMs: Math.max(0, ...db.map((s) => s.durationMs)),
    renderMs,
    service: root?.service ?? null,
    server,
  };
}

/** Bar parts for a stacked Server / Database / Render bar. They add up to `totalMs`. */
export function timingSegments(t: Pick<Timing, "totalMs" | "serverMs" | "dbMs" | "renderMs">): {
  server: number;
  db: number;
  render: number;
  other: number;
} {
  const total = Math.max(t.totalMs, 0);
  const render = Math.min(t.renderMs ?? 0, total);
  // Database time can come from other services, so it is not always inside the first server span.
  const serverAll = Math.min(Math.max(t.serverMs ?? 0, t.dbMs), total - render);
  const db = Math.min(t.dbMs, serverAll);
  return { server: serverAll - db, db, render, other: Math.max(0, total - serverAll - render) };
}
