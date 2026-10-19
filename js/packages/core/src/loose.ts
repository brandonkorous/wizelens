// Log lines written outside a request (startup, background jobs, timers) live in "loose" traces: no spans, a trace id that starts with 16 zeros.
import { newTraceId } from "./ids.js";
import type { LogLevel } from "./types.js";

/** The start of every loose trace id. A random W3C id starts this way about once in 2^64. */
export const LOOSE_TRACE_PREFIX = "0".repeat(16);
/** One loose trace holds the lines of one process in one 5-minute window (or fewer, when it fills up). */
export const LOOSE_WINDOW_MS = 300_000;

/** True for the trace id of lines written outside a request. */
export const isLooseTraceId = (traceId: string): boolean => traceId.length === 32 && traceId.startsWith(LOOSE_TRACE_PREFIX);

/** A new random loose trace id, for an add-on's next batch of lines. */
export function newLooseTraceId(): string {
  let tail = newTraceId().slice(16);
  while (tail === LOOSE_TRACE_PREFIX) tail = newTraceId().slice(16);
  return LOOSE_TRACE_PREFIX + tail;
}

/** 53-bit string hash (cyrb53) as 14 hex digits: the same in every runtime, no crypto needed. */
export function hash53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** The loose trace id for lines a host receives without one (OTLP): one per source and 5-minute window. */
export const looseTraceIdOf = (source: string, timeMs: number): string => `${LOOSE_TRACE_PREFIX}${hash53(`${source}|${Math.floor(timeMs / LOOSE_WINDOW_MS)}`)}01`;

/** Lines outside a request: on or off, the lowest level kept, and the share of lines below warn kept. */
export interface LooseLogOptions {
  outside: boolean;
  minLevel: LogLevel;
  sampleRate: number;
}

export const DEFAULT_LOOSE_LOGS: LooseLogOptions = { outside: true, minLevel: "info", sampleRate: 1 };

const RANKS: Record<LogLevel, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, critical: 5 };

/** True when a line outside a request is kept: on, at or above the floor, and (below warn) inside the sample. */
export function keepLooseLine(o: LooseLogOptions, level: LogLevel, random: () => number = Math.random): boolean {
  if (!o.outside || RANKS[level] < RANKS[o.minLevel]) return false;
  return RANKS[level] >= RANKS.warn || o.sampleRate >= 1 || random() < Math.max(0, o.sampleRate);
}
