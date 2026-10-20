// List facts: the rows pages page through (requests, traces, logs, critical spans), one trace at a time.
import { DEFAULT_SLOW_MS } from "../health.js";
import { traceListItem, type TraceListItem } from "../models/traces.js";
import { logRows, type LogRow } from "../stats/logs.js";
import type { RequestRow } from "../stats/requests.js";
import { type CriticalSpan, criticalSpans, traceDurationOf } from "../stats/traces.js";
import type { Trace } from "../types.js";

/** A request row without its findings: what list tables store and pages show. */
export type RequestItem = Omit<RequestRow, "findings">;

/** A Traces list row, with what list queries filter and sort on. */
export interface TraceItem extends TraceListItem {
  startMs: number;
  /** The project's label, when one read covers many projects (the cloud's "All projects"). */
  project?: string;
  spanCount: number;
  /** Duration at or over DEFAULT_SLOW_MS, as the Traces cards count it. */
  slow: boolean;
}

export function requestItemOf(r: RequestRow): RequestItem {
  const { findings: _findings, ...item } = r;
  return item;
}

export const traceItemOf = (t: Trace): TraceItem => ({ ...traceListItem(t), startMs: t.startMs, spanCount: t.spanCount, slow: traceDurationOf(t) >= DEFAULT_SLOW_MS });

/** Log lines of one trace, newest first, keyed `traceId:index` like `logRows`. */
export const traceLogRows = (t: Trace): LogRow[] => logRows([t]);

/** The slowest spans of one trace below its root. Global top lists are exact unless one trace holds more than `k` of them. */
export const traceCritical = (t: Trace, k: number): CriticalSpan[] => criticalSpans([t], k);
