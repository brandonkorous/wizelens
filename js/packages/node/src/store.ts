import { ATTR_BROWSER_SESSION, buildTrace, type LogRecord, type Span, type Trace, type TraceSummary, toSummary } from "@wizeworks/lens-core";

interface Entry {
  traceId: string;
  spans: Map<string, Span>;
  logs: LogRecord[];
  remotes: Set<string>;
  sessions: Set<string>;
  /** Earliest span start or log time. Used for age eviction. */
  startMs: number;
}

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

export interface TraceStoreOptions {
  /** Max traces kept. Oldest are dropped first. Default 2000. */
  maxTraces?: number;
  /** Max trace age in ms, measured from its start. Default 24 h. */
  maxAgeMs?: number;
  /** Max spans kept per trace. Default 2000. */
  maxSpansPerTrace?: number;
  /** Max logs kept per trace. Default 1000. */
  maxLogsPerTrace?: number;
  /** Clock, for tests. */
  now?: () => number;
}

interface Dirty {
  spans: Set<string>;
  logsFrom: number;
  remotes: boolean;
}

/** In-memory ring buffer of traces, keyed by trace id. This is always the read path. */
export class TraceStore {
  readonly #entries = new Map<string, Entry>();
  readonly #dirty = new Map<string, Dirty>();
  readonly #maxTraces: number;
  readonly #maxAgeMs: number;
  readonly #maxSpans: number;
  readonly #maxLogs: number;
  readonly #now: () => number;

  constructor(options: TraceStoreOptions = {}) {
    this.#maxTraces = Math.max(1, options.maxTraces ?? 2000);
    this.#maxAgeMs = Math.max(1, options.maxAgeMs ?? 24 * 60 * 60 * 1000);
    this.#maxSpans = options.maxSpansPerTrace ?? 2000;
    this.#maxLogs = options.maxLogsPerTrace ?? 1000;
    this.#now = options.now ?? Date.now;
  }

  get size(): number {
    return this.#entries.size;
  }

  get maxTraces(): number {
    return this.#maxTraces;
  }

  get maxAgeMs(): number {
    return this.#maxAgeMs;
  }

  #entry(traceId: string, startMs: number): Entry {
    let entry = this.#entries.get(traceId);
    if (!entry) {
      entry = { traceId, spans: new Map(), logs: [], remotes: new Set(), sessions: new Set(), startMs };
      this.#entries.set(traceId, entry);
      while (this.#entries.size > this.#maxTraces) {
        const oldest = this.#entries.keys().next().value;
        if (oldest === undefined) break;
        this.#entries.delete(oldest);
      }
    } else if (startMs < entry.startMs) {
      entry.startMs = startMs;
    }
    return entry;
  }

  #markDirty(traceId: string): Dirty {
    let d = this.#dirty.get(traceId);
    if (!d) {
      const entry = this.#entries.get(traceId);
      d = { spans: new Set(), logsFrom: entry?.logs.length ?? 0, remotes: false };
      this.#dirty.set(traceId, d);
    }
    return d;
  }

  addSpan(span: Span): void {
    const entry = this.#entry(span.traceId, span.startMs);
    if (entry.spans.size >= this.#maxSpans && !entry.spans.has(span.spanId)) return;
    entry.spans.set(span.spanId, span);
    const session = span.attributes[ATTR_BROWSER_SESSION];
    if (typeof session === "string" && session) entry.sessions.add(session);
    this.#markDirty(span.traceId).spans.add(span.spanId);
  }

  addLog(traceId: string, log: LogRecord): void {
    const entry = this.#entry(traceId, log.timeMs);
    if (entry.logs.length >= this.#maxLogs) return;
    this.#markDirty(traceId);
    entry.logs.push(log);
  }

  addRemote(traceId: string, endpoint: string): void {
    const entry = this.#entry(traceId, this.#now());
    if (entry.remotes.has(endpoint)) return;
    entry.remotes.add(endpoint);
    this.#markDirty(traceId).remotes = true;
  }

  /** Load traces from disk, oldest first. Does not mark them dirty. */
  load(traces: Iterable<StoredTrace>): void {
    for (const t of traces) {
      const entry = this.#entry(t.traceId, t.startMs);
      for (const s of t.spans) {
        entry.spans.set(s.spanId, s);
        const session = s.attributes[ATTR_BROWSER_SESSION];
        if (typeof session === "string" && session) entry.sessions.add(session);
      }
      entry.logs.push(...t.logs);
      for (const r of t.remotes) entry.remotes.add(r);
    }
  }

  /** Take all changes since the last call. */
  drainChanges(): TraceChanges[] {
    const out: TraceChanges[] = [];
    for (const [traceId, d] of this.#dirty) {
      const entry = this.#entries.get(traceId);
      if (!entry) continue; // evicted before it was written: nothing to keep
      const spans: Span[] = [];
      for (const id of d.spans) {
        const s = entry.spans.get(id);
        if (s) spans.push(s);
      }
      const logs = entry.logs.slice(d.logsFrom).map((log, i) => ({ seq: d.logsFrom + i, log }));
      out.push({ traceId, startMs: entry.startMs, remotes: [...entry.remotes], spans, logs });
    }
    this.#dirty.clear();
    return out;
  }

  /** Drop traces older than maxAgeMs. Returns how many were dropped. */
  pruneByAge(): number {
    const cutoff = this.#now() - this.#maxAgeMs;
    let dropped = 0;
    for (const [id, entry] of this.#entries) {
      if (entry.startMs < cutoff) {
        this.#entries.delete(id);
        this.#dirty.delete(id);
        dropped++;
      }
    }
    return dropped;
  }

  get(traceId: string): Trace | undefined {
    const entry = this.#entries.get(traceId);
    return entry ? buildTrace(entry.traceId, [...entry.spans.values()], entry.logs, entry.remotes) : undefined;
  }

  /** All traces, newest first. With `session`, only traces that have a browser span from that tab. */
  all(session?: string): Trace[] {
    this.pruneByAge();
    const traces: Trace[] = [];
    for (const entry of this.#entries.values()) {
      if (entry.spans.size === 0 && entry.logs.length === 0) continue;
      if (session !== undefined && !entry.sessions.has(session)) continue;
      traces.push(buildTrace(entry.traceId, [...entry.spans.values()], entry.logs, entry.remotes));
    }
    return traces.sort((a, b) => b.startMs - a.startMs);
  }

  list(limit = 50, session?: string): TraceSummary[] {
    return this.all(session).slice(0, Math.max(0, limit)).map(toSummary);
  }

  clear(): void {
    this.#entries.clear();
    this.#dirty.clear();
  }
}
