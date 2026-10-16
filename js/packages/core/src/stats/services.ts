import { browserTypeOf } from "../attributes.js";
import { isErrorSpan } from "../trace.js";
import type { Span, Trace } from "../types.js";
import { avgOf, groupBy, percentileOf, percentOf } from "./common.js";

export type ServiceKind = "api" | "web" | "database" | "external";
export type ServiceStatus = "healthy" | "degraded" | "unhealthy" | "idle";

/** One service, database, or outside host, with its traffic in the given traces. */
export interface ServiceRow {
  key: string;
  name: string;
  kind: ServiceKind;
  status: ServiceStatus;
  /** Requests served (api, web), queries run (database), or calls received (external). */
  requests: number;
  errors: number;
  /** Errors as a percent of requests. */
  errorRate: number;
  avgMs: number | null;
  p95Ms: number | null;
  /** Database system or host, for example "sqlite" or "api.stripe.com". */
  detail: string | null;
}

/** Calls from one service to another, to a database, or to an outside host. */
export interface ServiceEdge {
  from: string;
  to: string;
  calls: number;
  avgMs: number | null;
  errors: number;
}

const DEGRADED_P95_MS = 1000;

export function statusOf(requests: number, errorRate: number, p95Ms: number | null): ServiceStatus {
  if (requests === 0) return "idle";
  if (errorRate >= 10) return "unhealthy";
  return errorRate >= 1 || (p95Ms ?? 0) >= DEGRADED_P95_MS ? "degraded" : "healthy";
}

const failed = (s: Span) => isErrorSpan(s) || Number(s.attributes["http.response.status_code"] ?? 0) >= 500;
const str = (s: Span, k: string) => (s.attributes[k] == null ? null : String(s.attributes[k]));

function rowOf(key: string, name: string, kind: ServiceKind, spans: Span[], detail: string | null): ServiceRow {
  const durations = spans.map((s) => s.durationMs);
  const errors = spans.filter(failed).length;
  const errorRate = percentOf(errors, spans.length);
  const p95Ms = percentileOf(durations, 95);
  return { key, name, kind, status: statusOf(spans.length, errorRate, p95Ms), requests: spans.length, errors, errorRate, avgMs: avgOf(durations), p95Ms, detail };
}

/** Database key: system plus namespace when known, for example "sqlite · orders". */
export function databaseOf(s: Span): string {
  const system = str(s, "db.system.name") ?? "database";
  const ns = str(s, "db.namespace");
  return ns ? `${system} · ${ns}` : system;
}

/** Outbound calls that no WizeLens service answered. Keyed by host. */
function externalCalls(traces: readonly Trace[]): Span[] {
  const out: Span[] = [];
  for (const t of traces) {
    const answered = new Set(t.spans.filter((s) => s.category === "http.server" && s.parentSpanId).map((s) => s.parentSpanId));
    for (const s of t.spans) if (s.category === "http.client" && !answered.has(s.spanId)) out.push(s);
  }
  return out;
}

export function hostOf(s: Span): string {
  const full = str(s, "url.full");
  if (full) {
    try {
      return new URL(full).host;
    } catch {
      // fall through to server.address
    }
  }
  return str(s, "server.address") ?? "unknown host";
}

/** Services, databases, and outside hosts seen in the traces, busiest first. */
export function serviceRows(traces: readonly Trace[]): ServiceRow[] {
  const spans = traces.flatMap((t) => t.spans);
  const rows: ServiceRow[] = [];
  for (const [name, list] of groupBy(spans.filter((s) => s.category === "http.server"), (s) => s.service)) rows.push(rowOf(`api:${name}`, name, "api", list, null));
  const web = spans.filter((s) => browserTypeOf(s) === "fetch");
  if (web.length) rows.push(rowOf("web:browser", "Web App", "web", web, "browser"));
  for (const [db, list] of groupBy(spans.filter((s) => s.category === "db"), databaseOf)) rows.push(rowOf(`db:${db}`, db, "database", list, str(list[0]!, "db.system.name")));
  for (const [host, list] of groupBy(externalCalls(traces), hostOf)) rows.push(rowOf(`ext:${host}`, host, "external", list, host));
  return rows.sort((a, b) => b.requests - a.requests);
}

function edgeTarget(s: Span, byParent: Map<string, Span>): string | null {
  if (s.category === "db") return databaseOf(s);
  if (s.category !== "http.client" && browserTypeOf(s) !== "fetch") return null;
  const server = byParent.get(s.spanId);
  return server ? server.service : s.category === "http.client" ? hostOf(s) : null;
}

/** Who calls whom: service → service, service → database, service → outside host, browser → service. */
export function serviceEdges(traces: readonly Trace[]): ServiceEdge[] {
  const calls: { from: string; to: string; span: Span }[] = [];
  for (const t of traces) {
    const byParent = new Map(t.spans.filter((s) => s.category === "http.server" && s.parentSpanId).map((s) => [s.parentSpanId!, s]));
    for (const s of t.spans) {
      const to = edgeTarget(s, byParent);
      if (to) calls.push({ from: s.category === "browser" ? "Web App" : s.service, to, span: s });
    }
  }
  return [...groupBy(calls, (c) => `${c.from}→${c.to}`).values()].map((list) => ({
    from: list[0]!.from,
    to: list[0]!.to,
    calls: list.length,
    avgMs: avgOf(list.map((c) => c.span.durationMs)),
    errors: list.filter((c) => failed(c.span)).length,
  }));
}
