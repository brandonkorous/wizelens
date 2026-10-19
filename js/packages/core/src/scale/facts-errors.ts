// Error and log facts: the err* kinds (exceptions by group, type, service, endpoint) and log* (lines by level).
import { type ErrorEvent, errorEvents } from "../stats/errors.js";
import { isLooseTraceId } from "../loose.js";
import { logPattern, patternIdOf } from "../stats/log-patterns.js";
import { type LogRow } from "../stats/logs.js";
import type { Trace } from "../types.js";
import { type Contribution, contribution, withServices } from "./agg.js";
import { joinKey } from "./kinds.js";

/** Stacks in rollup tops are cut to this many characters. */
export const TOP_STACK_MAX = 8192;

const capStack = (e: ErrorEvent): ErrorEvent => (e.stack && e.stack.length > TOP_STACK_MAX ? { ...e, stack: e.stack.slice(0, TOP_STACK_MAX) } : e);

function eventContributions(e: ErrorEvent): Contribution[] {
  const at = e.timeMs;
  const critical = { c: [e.critical ? 1 : 0] };
  return [
    contribution("err", "", at, critical),
    contribution("err.g", e.key, at, { ...critical, top: { rank: at, data: capStack(e) } }),
    contribution("err.ge", joinKey(e.key, e.endpoint), at),
    contribution("err.t", e.type, at),
    contribution("err.s", e.service, at),
    contribution("err.e", e.endpoint, at),
  ].flatMap((c) => withServices(c, [e.service]));
}

/** Everything one trace's errors add to the rollups. */
export const errorFacts = (trace: Trace): Contribution[] => errorEvents([trace]).flatMap(eventContributions);

/** Sample messages in pattern tops are cut to this many characters. */
export const PATTERN_SAMPLE_MAX = 500;

/** The top of a `log.p` row: the pattern, and the newest line's message, category, and trace. */
export interface PatternSample {
  pattern: string;
  message: string;
  category: string;
  traceId: string;
}

const patternSample = (l: LogRow): PatternSample => ({ pattern: logPattern(l.message), message: l.message.slice(0, PATTERN_SAMPLE_MAX), category: l.category, traceId: l.traceId });

/** Log lines by level, by display service and level, and by service, level, and pattern (with the newest line as its sample). */
export const logFacts = (rows: readonly LogRow[]): Contribution[] =>
  rows.flatMap((l) => [
    contribution("log", l.level, l.timeMs),
    contribution("log.s", joinKey(l.service, l.level), l.timeMs),
    contribution("log.p", joinKey(l.service, l.level, patternIdOf(l.message), isLooseTraceId(l.traceId) ? "o" : "r"), l.timeMs, { top: { rank: l.timeMs, data: patternSample(l) } }),
  ]);
