import { isErrorStatus, keepByRate, type LogRecord, type SamplingInfo, type Span } from "@wizeworks/lens-core";

export interface SamplingOptions {
  /** Share of traces kept, 0 to 1. Default 1 (all), or the WIZELENS_SAMPLE_RATE variable. */
  rate?: number;
  /** Keep traces with an error at any rate. Default true. */
  keepErrors?: boolean;
  /** Keep traces with a server-side span at least this slow (ms) at any rate. Null turns it off. Default 1000. */
  keepSlowMs?: number | null;
}

/** What the store does with one span or log. `held` comes with the first "keep" of a held trace. */
export type Verdict = { action: "keep"; held: Held | null } | { action: "hold" } | { action: "drop" };

export interface Held {
  spans: Span[];
  logs: LogRecord[];
  remotes: string[];
}

interface Pending extends Held {
  sinceMs: number;
}

const KEEP: Verdict = { action: "keep", held: null };
const HOLD: Verdict = { action: "hold" };
const DROP: Verdict = { action: "drop" };
const MAX_DECIDED = 20_000;
const MAX_PENDING = 2000;
const HOLD_MS = 60_000;

/** The sampling settings, or null when every trace is kept. */
export function samplingInfo(o: SamplingOptions | undefined, env = process.env.WIZELENS_SAMPLE_RATE): SamplingInfo | null {
  const raw = o?.rate ?? (env ? Number(env) : 1);
  const rate = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 1;
  if (rate >= 1) return null;
  return { rate, keepErrors: o?.keepErrors ?? true, keepSlowMs: o?.keepSlowMs === undefined ? 1000 : o.keepSlowMs };
}

/** Decides, per trace, what the store keeps. A trace outside the rate waits until its local root span ends, then stays only when it had an error or a slow span. */
export class TraceSampler {
  readonly info: SamplingInfo;
  readonly #now: () => number;
  readonly #decided = new Map<string, boolean>();
  readonly #pending = new Map<string, Pending>();

  constructor(info: SamplingInfo, now: () => number = Date.now) {
    this.info = info;
    this.#now = now;
  }

  /** `root`: the span starts this service's part of the trace (no parent, or a parent in another process). */
  span(span: Span, root: boolean): Verdict {
    const early = this.#known(span.traceId, this.#mustKeep(span));
    if (early) return early;
    const p = this.#hold(span.traceId);
    if (this.#mustKeep(span)) return this.#keep(span.traceId, p);
    if (!root) {
      p.spans.push(span);
      return HOLD;
    }
    this.#decide(span.traceId, false);
    this.#pending.delete(span.traceId);
    return DROP;
  }

  log(traceId: string, log: LogRecord): Verdict {
    const important = this.info.keepErrors && log.level === "error";
    const early = this.#known(traceId, important);
    if (early) return early;
    const p = this.#hold(traceId);
    if (important) return this.#keep(traceId, p);
    p.logs.push(log);
    return HOLD;
  }

  /** A downstream endpoint. It never decides a trace; it waits with it. */
  remote(traceId: string, endpoint: string): Verdict {
    const early = this.#known(traceId, false);
    if (early) return early;
    this.#hold(traceId).remotes.push(endpoint);
    return HOLD;
  }

  // A decided or in-rate trace. An error after a drop keeps the rest of the trace.
  #known(traceId: string, important: boolean): Verdict | null {
    this.#expire();
    const decided = this.#decided.get(traceId);
    if (decided === true) return KEEP;
    if (decided === false) return important ? (this.#decide(traceId, true), KEEP) : DROP;
    if (!keepByRate(traceId, this.info.rate)) return null;
    this.#decide(traceId, true);
    return KEEP;
  }

  #mustKeep(span: Span): boolean {
    if (this.info.keepErrors && isErrorStatus(span)) return true;
    // A browser span's length is a page or render window, not a wait: it never counts as slow.
    return this.info.keepSlowMs !== null && span.category !== "browser" && span.durationMs >= this.info.keepSlowMs;
  }

  #keep(traceId: string, p: Pending): Verdict {
    this.#pending.delete(traceId);
    this.#decide(traceId, true);
    const some = p.spans.length + p.logs.length + p.remotes.length > 0;
    return { action: "keep", held: some ? { spans: p.spans, logs: p.logs, remotes: p.remotes } : null };
  }

  #hold(traceId: string): Pending {
    let p = this.#pending.get(traceId);
    if (p) return p;
    p = { spans: [], logs: [], remotes: [], sinceMs: this.#now() };
    this.#pending.set(traceId, p);
    if (this.#pending.size > MAX_PENDING) this.#dropOldest();
    return p;
  }

  #decide(traceId: string, keep: boolean): void {
    this.#decided.delete(traceId);
    this.#decided.set(traceId, keep);
    if (this.#decided.size > MAX_DECIDED) this.#decided.delete(this.#decided.keys().next().value!);
  }

  #dropOldest(): void {
    const oldest = this.#pending.keys().next().value;
    if (oldest === undefined) return;
    this.#pending.delete(oldest);
    this.#decide(oldest, false);
  }

  // A trace whose root never ended (a lost request, a job with no root) is dropped after a while.
  #expire(): void {
    const cutoff = this.#now() - HOLD_MS;
    for (const [id, p] of this.#pending) {
      if (p.sinceMs >= cutoff) return;
      this.#pending.delete(id);
      this.#decide(id, false);
    }
  }
}
