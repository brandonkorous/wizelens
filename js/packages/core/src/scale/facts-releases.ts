// Release facts: requests and jobs per service version (rel), from each span that starts work in its service.
import { displayService } from "../stats/errors.js";
import { isFailedSpan } from "../stats/services.js";
import { versionOf } from "../releases.js";
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
    return [contribution("rel", joinKey(displayService(s.service), version), s.startMs, { err: isFailedSpan(s) ? 1 : 0, sum: s.durationMs, values: [s.durationMs] })];
  });
}
