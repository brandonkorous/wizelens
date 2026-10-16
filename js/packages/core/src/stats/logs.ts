import type { Attributes, LogLevel, Trace } from "../types.js";
import { memoByObject } from "./common.js";
import { displayService } from "./errors.js";

export const LOG_LEVELS: readonly LogLevel[] = ["trace", "debug", "info", "warn", "error", "critical"];

/** One log line, with the trace it was written in. */
export interface LogRow {
  key: string;
  traceId: string;
  traceName: string;
  spanId: string | null;
  timeMs: number;
  level: LogLevel;
  service: string;
  category: string;
  message: string;
  attributes: Attributes;
}

function rowsOf(trace: Trace): LogRow[] {
  return trace.logs.map((l, i) => ({
    key: `${trace.traceId}:${i}`,
    traceId: trace.traceId,
    traceName: trace.rootName,
    spanId: l.spanId,
    timeMs: l.timeMs,
    level: l.level,
    service: displayService(l.service),
    category: l.category,
    message: l.message,
    attributes: l.attributes,
  }));
}

const rowsOfTrace = memoByObject(rowsOf);

/** Every log line in the traces, newest first. */
export const logRows = (traces: readonly Trace[]): LogRow[] => traces.flatMap(rowsOfTrace).sort((a, b) => b.timeMs - a.timeMs);

export interface LogFilter {
  /** Lowest level to show, for example "warn" shows warn, error, and critical. */
  minLevel: LogLevel;
  /** Service to show, or "" for all. */
  service: string;
  /** Text to find in the message, category, or trace name. */
  query: string;
}

export const levelRank = (level: LogLevel): number => LOG_LEVELS.indexOf(level);

export function filterLogs(rows: readonly LogRow[], f: LogFilter): LogRow[] {
  const min = levelRank(f.minLevel);
  const q = f.query.trim().toLowerCase();
  return rows.filter(
    (r) =>
      levelRank(r.level) >= min &&
      (!f.service || r.service === f.service) &&
      (!q || r.message.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || r.traceName.toLowerCase().includes(q) || r.traceId.startsWith(q)),
  );
}

/** Lines per level. */
export function levelCounts(rows: readonly LogRow[]): Record<LogLevel, number> {
  const counts = Object.fromEntries(LOG_LEVELS.map((l) => [l, 0])) as Record<LogLevel, number>;
  for (const r of rows) counts[r.level]++;
  return counts;
}
