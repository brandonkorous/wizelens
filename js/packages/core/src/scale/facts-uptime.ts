// Uptime facts: check runs by check (`up.chk`) and all together (`up`). Runs count only on the Uptime page, never as app traffic.
import type { Span, Trace } from "../types.js";
import { ATTR_UPTIME_CHECK, ATTR_UPTIME_OK, isUptimeSpan } from "../uptime/check.js";
import { type Contribution, contribution } from "./agg.js";

/** A run that failed: `wizelens.uptime.ok` false, or an error status on a run written without it. */
const failedRun = (s: Span): boolean => (s.attributes[ATTR_UPTIME_OK] == null ? s.status === "error" : s.attributes[ATTR_UPTIME_OK] !== true);

/** Each check run of the trace: its check, whether it failed, and its response time. */
export function uptimeFacts(trace: Trace): Contribution[] {
  return trace.spans.filter(isUptimeSpan).flatMap((s) => {
    const id = s.attributes[ATTR_UPTIME_CHECK];
    if (typeof id !== "string" || !id) return [];
    const run = { err: failedRun(s) ? 1 : 0, sum: s.durationMs };
    return [contribution("up", "", s.startMs, run), contribution("up.chk", id, s.startMs, { ...run, values: [s.durationMs] })];
  });
}
