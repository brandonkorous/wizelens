import { analyzeTrace, entryServerSpan, insightsOf, type Trace, type TraceSummary, traceTiming } from "@wizeworks/lens-core";
import type { RecordedRequest, ServerStats } from "./recorder-types.js";

export function pathOf(url: string, base: string): string {
  try {
    const u = new URL(url, base);
    return u.origin === new URL(base).origin ? u.pathname + u.search : u.href;
  } catch {
    return url;
  }
}

/** Server stats from a full (federated) trace. Browser spans do not count. */
export function serverStatsFromTrace(trace: Trace): ServerStats {
  const spans = trace.spans.filter((s) => s.category !== "browser");
  const root = entryServerSpan(trace.spans);
  const db = spans.filter((s) => s.category === "db").sort((a, b) => a.startMs - b.startMs);
  const timing = traceTiming(trace);
  return {
    name: root?.name ?? null,
    durationMs: root?.durationMs ?? null,
    dbCount: db.length,
    dbMs: timing.dbMs,
    dbSlowestMs: db.length ? timing.dbSlowestMs : null,
    dbDurations: db.map((s) => s.durationMs),
    httpClientCount: spans.filter((s) => s.category === "http.client").length,
    errorCount: spans.filter((s) => s.status === "error").length,
    insights: insightsOf(analyzeTrace(trace)).length,
    parts: timing.server,
    services: [...new Set(spans.map((s) => s.service))],
  };
}

function summaryStats(t: TraceSummary): ServerStats {
  return {
    name: null,
    durationMs: null,
    dbCount: t.dbCount,
    dbMs: null,
    dbSlowestMs: null,
    dbDurations: [],
    httpClientCount: t.httpClientCount,
    errorCount: t.errorCount,
    insights: null,
    parts: null,
    services: t.services.filter((s) => s !== "browser"),
  };
}

/** Turn a server trace summary into a HUD row. */
export function summaryToRequest(t: TraceSummary, base: string): RecordedRequest {
  const [nameMethod, ...rest] = t.rootName.split(" ");
  const url = t.rootUrl ?? (rest.join(" ") || t.rootName);
  return {
    id: `restored:${t.traceId}`,
    method: (t.rootMethod ?? (nameMethod && /^[A-Z]+$/.test(nameMethod) ? nameMethod : "GET")).toUpperCase(),
    url,
    path: pathOf(url, base),
    status: t.rootStatusCode,
    durationMs: t.durationMs,
    renderMs: null,
    traceId: t.traceId,
    profiled: true,
    startMs: t.startMs,
    error: t.status === "error" && (t.rootStatusCode === null || t.rootStatusCode < 500) ? "error" : null,
    restored: true,
    server: summaryStats(t),
  };
}

/** Merge restored rows under live ones: newest first, one row per trace, at most `max`. */
export function mergeRequests(
  live: readonly RecordedRequest[],
  restored: readonly RecordedRequest[],
  max: number,
): RecordedRequest[] {
  const seen = new Set(live.map((r) => r.traceId));
  const extra = restored.filter((r) => !seen.has(r.traceId));
  return [...live, ...extra].sort((a, b) => b.startMs - a.startMs).slice(0, max);
}
