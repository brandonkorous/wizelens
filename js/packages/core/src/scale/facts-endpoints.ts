// Endpoint facts: what each API endpoint calls (ep.call) and which queries it runs (ep.q), by the endpoint that served the span.
import { queryText } from "../analysis.js";
import { endpointNameOf } from "../models/service-detail.js";
import { normalizeQuery } from "../stats/common.js";
import { edgeCallsOf, isFailedSpan } from "../stats/services.js";
import type { Span, Trace } from "../types.js";
import { type Contribution, contribution } from "./agg.js";
import { joinKey } from "./kinds.js";

/** The http.server span in the same service that a span ran under, or null. */
function serverOf(s: Span, byId: ReadonlyMap<string, Span>): Span | null {
  for (let p: Span | undefined = s; p; p = p.parentSpanId ? byId.get(p.parentSpanId) : undefined) {
    if (p.category === "http.server") return p.service === s.service ? p : null;
  }
  return null;
}

/** The key head of an endpoint: its Services row key and its name, as `svc.ep` keys it. */
export const endpointHead = (server: Span): string => joinKey(`api:${server.service}`, endpointNameOf(server, "api"));

/** Everything one trace adds per endpoint: its outgoing calls and its queries. */
export function endpointFacts(trace: Trace): Contribution[] {
  const byId = new Map(trace.spans.map((s) => [s.spanId, s]));
  const of = (s: Span, kind: "ep.call" | "ep.q", target: string): Contribution[] => {
    const server = serverOf(s, byId);
    return server ? [contribution(kind, joinKey(endpointHead(server), target), s.startMs, { err: isFailedSpan(s) ? 1 : 0, sum: s.durationMs })] : [];
  };
  const calls = edgeCallsOf(trace).flatMap(({ to, span }) => (span.category === "browser" ? [] : of(span, "ep.call", to)));
  const queries = trace.spans.filter((s) => s.category === "db").flatMap((s) => of(s, "ep.q", normalizeQuery(queryText(s))));
  return [...calls, ...queries];
}
