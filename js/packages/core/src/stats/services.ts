import { browserTypeOf, isWebAppCall } from "../attributes.js";
import { isFailedAnswer } from "../trace.js";
import type { Span, Trace } from "../types.js";
import { avgOf, groupBy, percentileOf, percentOf } from "./common.js";
import { isConsumer, isProducer, queueOf } from "./messaging.js";

export type ServiceKind = "api" | "web" | "worker" | "queue" | "database" | "external";
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
  /** From the stats tables only: p95 of the calls. */
  p95Ms?: number | null;
}

const DEGRADED_P95_MS = 1000;

export function statusOf(requests: number, errorRate: number, p95Ms: number | null): ServiceStatus {
  if (requests === 0) return "idle";
  if (errorRate >= 10) return "unhealthy";
  return errorRate >= 1 || (p95Ms ?? 0) >= DEGRADED_P95_MS ? "degraded" : "healthy";
}

/** A failed span: an error, or a 5xx response. */
export const isFailedSpan = (s: Span): boolean => isFailedAnswer(s);
const str = (s: Span, k: string) => (s.attributes[k] == null ? null : String(s.attributes[k]));

function rowOf(key: string, name: string, kind: ServiceKind, spans: Span[], detail: string | null): ServiceRow {
  const durations = spans.map((s) => s.durationMs);
  const errors = spans.filter(isFailedSpan).length;
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

/** Outbound calls of one trace that no WizeLens service answered. */
export function externalCallsOf(t: Trace): Span[] {
  const answered = new Set(t.spans.filter((s) => s.category === "http.server" && s.parentSpanId).map((s) => s.parentSpanId));
  return t.spans.filter((s) => s.category === "http.client" && !answered.has(s.spanId));
}

/** Outbound calls that no WizeLens service answered. Keyed by host. */
const externalCalls = (traces: readonly Trace[]): Span[] => traces.flatMap(externalCallsOf);

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
  const web = spans.filter(isWebAppCall);
  if (web.length) rows.push(rowOf("web:browser", "Web App", "web", web, "browser"));
  for (const [db, list] of groupBy(spans.filter((s) => s.category === "db"), databaseOf)) rows.push(rowOf(`db:${db}`, db, "database", list, str(list[0]!, "db.system.name")));
  for (const [host, list] of groupBy(externalCalls(traces), hostOf)) rows.push(rowOf(`ext:${host}`, host, "external", list, host));
  rows.push(...messagingRows(spans, new Set(rows.filter((r) => r.kind === "api").map((r) => r.name))));
  return rows.sort((a, b) => b.requests - a.requests);
}

/** Queues (messages sent to each) and workers (services that only handle messages). */
function messagingRows(spans: readonly Span[], apis: ReadonlySet<string>): ServiceRow[] {
  const rows: ServiceRow[] = [];
  for (const [queue, list] of groupBy(spans.filter(isProducer), queueOf)) rows.push(rowOf(`queue:${queue}`, queue, "queue", list, queue));
  const handled = spans.filter((s) => isConsumer(s) && !apis.has(s.service));
  for (const [name, list] of groupBy(handled, (s) => s.service)) rows.push(rowOf(`worker:${name}`, name, "worker", list, null));
  return rows;
}

/** A messaging span as an edge: service → queue for a send, queue → service for a handled message. */
function messagingEdge(s: Span): { from: string; to: string } | null {
  if (isProducer(s)) return { from: s.service, to: queueOf(s) };
  if (isConsumer(s)) return { from: queueOf(s), to: s.service };
  return null;
}

function edgeTarget(s: Span, byParent: Map<string, Span>): string | null {
  if (s.category === "db") return databaseOf(s);
  if (s.category !== "http.client" && browserTypeOf(s) !== "fetch") return null;
  const server = byParent.get(s.spanId);
  return server ? server.service : s.category === "http.client" ? hostOf(s) : null;
}

/** One call from a service to a target, with the span that made it. */
export interface EdgeCall {
  from: string;
  to: string;
  span: Span;
}

/** The calls of one trace as edges: service → service, database, outside host, or queue; queue → worker. */
export function edgeCallsOf(t: Trace): EdgeCall[] {
  const calls: EdgeCall[] = [];
  const byParent = new Map(t.spans.filter((s) => s.category === "http.server" && s.parentSpanId).map((s) => [s.parentSpanId!, s]));
  for (const s of t.spans) {
    const message = messagingEdge(s);
    if (message) calls.push({ ...message, span: s });
    const to = message ? null : edgeTarget(s, byParent);
    if (to) calls.push({ from: s.category === "browser" ? "Web App" : s.service, to, span: s });
  }
  return calls;
}

/** Who calls whom: service → service, database, outside host, or queue; queue → worker; browser → service. */
export function serviceEdges(traces: readonly Trace[]): ServiceEdge[] {
  const calls = traces.flatMap(edgeCallsOf);
  return [...groupBy(calls, (c) => `${c.from}→${c.to}`).values()].map((list) => ({
    from: list[0]!.from,
    to: list[0]!.to,
    calls: list.length,
    avgMs: avgOf(list.map((c) => c.span.durationMs)),
    errors: list.filter((c) => isFailedSpan(c.span)).length,
  }));
}
