import type { LogRecord, Span } from "@wizeworks/lens-core/internal";

/** Changes to one trace since the last drain. Used by the persister. */
export interface TraceChanges {
  traceId: string;
  startMs: number;
  remotes: string[];
  spans: Span[];
  /** New logs with their index in the trace (stable across flushes). */
  logs: { seq: number; log: LogRecord }[];
}

/** Data loaded from disk at startup. */
export interface StoredTrace {
  traceId: string;
  startMs: number;
  spans: Span[];
  logs: LogRecord[];
  remotes: string[];
}
