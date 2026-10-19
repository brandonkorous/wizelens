// Facts: small flat records from one trace (list rows and rollup contributions), built with the stats code.
import { DEFAULT_SLOW_MS } from "../health.js";
import type { LogRow } from "../stats/logs.js";
import { requestOf } from "../stats/requests.js";
import { type CriticalSpan, traceDurationOf } from "../stats/traces.js";
import type { Trace } from "../types.js";
import { type Contribution, contribution, withServices } from "./agg.js";
import { dbFacts } from "./facts-db.js";
import { errorFacts, logFacts } from "./facts-errors.js";
import { type RequestItem, requestItemOf, traceCritical, type TraceItem, traceItemOf, traceLogRows } from "./facts-lists.js";
import { renderFacts } from "./facts-render.js";
import { requestContributions } from "./facts-requests.js";
import { endpointFacts } from "./facts-endpoints.js";
import { releaseFacts } from "./facts-releases.js";
import { serviceFacts, traceServices } from "./facts-services.js";

/** Bump when fact semantics change: hosts then rebuild their facts and rollups. */
export const FACTS_VERSION = 5;
/** A trace waits a few seconds for its stats on purpose; only one written longer ago than this counts as stats running behind. */
export const SETTLE_BEHIND_MS = 60_000;
/** Slow query threshold that hosts fix when a trace settles; the same as `analyzeTrace`'s default. */
export const FACT_SLOW_QUERY_MS = 100;
/** Critical span candidates kept per trace. */
export const FACT_CRITICAL_PER_TRACE = 5;

export interface FactOptions {
  slowQueryMs: number;
  criticalPerTrace: number;
}

export const DEFAULT_FACT_OPTIONS: FactOptions = { slowQueryMs: FACT_SLOW_QUERY_MS, criticalPerTrace: FACT_CRITICAL_PER_TRACE };

export interface TraceFacts {
  traceId: string;
  startMs: number;
  /** Null when the trace is not a request (a page view, a job). */
  request: RequestItem | null;
  trace: TraceItem;
  logs: LogRow[];
  critical: CriticalSpan[];
  /** Raw, with exact item times. */
  contributions: Contribution[];
}

function traceContributions(t: Trace): Contribution[] {
  return withServices(contribution("trace", "", t.startMs, { sum: t.spanCount, c: [traceDurationOf(t) >= DEFAULT_SLOW_MS ? 1 : 0] }), traceServices(t));
}

function buildFacts(trace: Trace, o: FactOptions): TraceFacts {
  const row = requestOf(trace);
  const logs = traceLogRows(trace);
  const contributions = [
    ...traceContributions(trace),
    ...(row ? requestContributions(row) : []),
    ...serviceFacts(trace),
    ...endpointFacts(trace),
    ...dbFacts(trace, o.slowQueryMs),
    ...errorFacts(trace),
    ...logFacts(logs),
    ...renderFacts(trace),
    ...releaseFacts(trace),
  ];
  return {
    traceId: trace.traceId,
    startMs: trace.startMs,
    request: row ? requestItemOf(row) : null,
    trace: traceItemOf(trace),
    logs,
    critical: traceCritical(trace, o.criticalPerTrace),
    contributions,
  };
}

const cache = new WeakMap<Trace, Map<string, TraceFacts>>();

/** The facts of one trace. Cached per trace object and options. */
export function traceFacts(trace: Trace, options: Partial<FactOptions> = {}): TraceFacts {
  const o = { ...DEFAULT_FACT_OPTIONS, ...options };
  const id = `${o.slowQueryMs}|${o.criticalPerTrace}`;
  let byOptions = cache.get(trace);
  if (!byOptions) cache.set(trace, (byOptions = new Map()));
  const hit = byOptions.get(id);
  if (hit) return hit;
  const facts = buildFacts(trace, o);
  byOptions.set(id, facts);
  return facts;
}
