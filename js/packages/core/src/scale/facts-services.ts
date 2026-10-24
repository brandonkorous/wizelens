// Service facts: the svc and svc.ep kinds (Services rows), edge (who calls whom), and bn.* (bottlenecks).
import { isWebAppCall } from "../attributes.js";
import { endpointNameOf } from "../models/service-detail.js";
import { isConsumer, isProducer, queueOf } from "../stats/messaging.js";
import { databaseOf, edgeCallsOf, externalCallsOf, hostOf, isFailedSpan, type ServiceKind } from "../stats/services.js";
import { traceParts } from "../stats/traces.js";
import { isStreamSpan, requestMsOf } from "../stream.js";
import { isUptimeSpan } from "../uptime/check.js";
import type { Span, Trace } from "../types.js";
import { browserAppOf, spanServiceName, webAppName, webRowKey } from "../web-app.js";
import { type Contribution, contribution, withServices } from "./agg.js";
import { joinKey } from "./kinds.js";

/** What a Services row shows besides its numbers. The `svc` kind keeps the newest one as its top. */
export interface ServiceRowInfo {
  name: string;
  kind: ServiceKind;
  detail: string | null;
}

const attr = (s: Span, k: string) => (s.attributes[k] == null ? null : String(s.attributes[k]));

/** The Services row a span counts in, with the same rules as `serviceRows`. Null for spans no row counts. */
export function serviceRowOf(s: Span, external: ReadonlySet<Span>): (ServiceRowInfo & { key: string }) | null {
  if (isUptimeSpan(s)) return null;
  if (s.category === "http.server") return { key: `api:${s.service}`, name: s.service, kind: "api", detail: null };
  if (isWebAppCall(s)) return { key: webRowKey(browserAppOf(s)), name: webAppName(browserAppOf(s)), kind: "web", detail: "browser" };
  if (s.category === "db") return { key: `db:${databaseOf(s)}`, name: databaseOf(s), kind: "database", detail: attr(s, "db.system.name") };
  if (external.has(s)) return { key: `ext:${hostOf(s)}`, name: hostOf(s), kind: "external", detail: hostOf(s) };
  if (isProducer(s)) return { key: `queue:${queueOf(s)}`, name: queueOf(s), kind: "queue", detail: queueOf(s) };
  if (isConsumer(s)) return { key: `worker:${s.service}`, name: s.service, kind: "worker", detail: null };
  return null;
}

/** Row kinds whose spans are listed by endpoint in the service detail. */
const WITH_ENDPOINTS: ReadonlySet<ServiceKind> = new Set(["api", "web", "database", "external"]);

/** A stream's open time, by Services row (`svc.stream`) and by row and endpoint (`req.stream`). */
function streamContributions(s: Span, key: string, endpoint: string): Contribution[] {
  if (!isStreamSpan(s)) return [];
  const open = { sum: s.durationMs, values: [s.durationMs] };
  return [contribution("svc.stream", key, s.startMs, open), contribution("req.stream", joinKey(key, endpoint), s.startMs, open)];
}

function serviceContributions(trace: Trace): Contribution[] {
  const external = new Set(externalCallsOf(trace));
  return trace.spans.flatMap((s) => {
    const row = serviceRowOf(s, external);
    if (!row) return [];
    const { key, ...info } = row;
    const ms = requestMsOf(s);
    const base = { err: isFailedSpan(s) ? 1 : 0, sum: ms };
    const out = [contribution("svc", key, s.startMs, { ...base, values: [ms], top: { rank: s.startMs, data: info } })];
    if (!WITH_ENDPOINTS.has(row.kind)) return out;
    const endpoint = endpointNameOf(s, row.kind);
    return [...out, contribution("svc.ep", joinKey(key, endpoint), s.startMs, { ...base, values: [ms] }), ...streamContributions(s, key, endpoint)];
  });
}

function edgeContributions(trace: Trace): Contribution[] {
  return edgeCallsOf(trace).map(({ from, to, span }) =>
    contribution("edge", joinKey(from, to), span.startMs, { err: isFailedSpan(span) ? 1 : 0, sum: span.durationMs, values: [span.durationMs], top: { rank: span.startMs, data: { from, to } } }),
  );
}

/** Every service with a span in the trace, by display name: the services a whole-trace count is filed under. */
export const traceServices = (t: Trace): string[] => [...new Set(t.spans.map(spanServiceName))];

/** Bottleneck parts at the trace's start time, with the same filter as `bottlenecks`. */
function bottleneckContributions(trace: Trace): Contribution[] {
  const parts = traceParts(trace).filter((p) => p.kind !== "browser" && p.ms > 0 && !p.key.startsWith("page:"));
  const at = trace.startMs;
  const services = traceServices(trace);
  return parts.flatMap((p) => [
    contribution("bn.layer", p.key, at, { sum: p.ms, top: { rank: at, data: { label: p.label, kind: p.kind } } }),
    contribution("bn.owner", p.owner, at, { sum: p.ms }),
  ]).flatMap((c) => withServices(c, services));
}

/** Everything one trace adds to the service, edge, and bottleneck rollups. */
export const serviceFacts = (trace: Trace): Contribution[] => [...serviceContributions(trace), ...edgeContributions(trace), ...bottleneckContributions(trace)];
