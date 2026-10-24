// Release facts: requests and jobs per service version (rel), from each span that starts work in its service.
import { spanServiceName } from "../web-app.js";
import { isFailedSpan } from "../stats/services.js";
import { versionOf } from "../releases.js";
import { requestMsOf } from "../stream.js";
import type { Trace } from "../types.js";
import { type Contribution, contribution } from "./agg.js";
import { joinKey } from "./kinds.js";

/** Spans whose parent is missing or in another service: a request, a job, or a message the service handled. */
export function releaseFacts(trace: Trace): Contribution[] {
  const byId = new Map(trace.spans.map((s) => [s.spanId, s]));
  return trace.spans.flatMap((s) => {
    const version = versionOf(s);
    const parent = s.parentSpanId ? byId.get(s.parentSpanId) : undefined;
    if (!version || (parent && parent.service === s.service)) return [];
    const ms = requestMsOf(s);
    return [contribution("rel", joinKey(spanServiceName(s), version), s.startMs, { err: isFailedSpan(s) ? 1 : 0, sum: ms, values: [ms] })];
  });
}
