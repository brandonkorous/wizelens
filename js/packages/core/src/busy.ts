import type { Span } from "./types.js";

type Timed = Pick<Span, "startMs" | "durationMs">;

/** Wall time the spans cover: spans that run at the same time count once. */
export function busyMs(spans: readonly Timed[]): number {
  const sorted = [...spans].sort((a, b) => a.startMs - b.startMs);
  let total = 0;
  let end = -Infinity;
  for (const s of sorted) {
    const stop = s.startMs + s.durationMs;
    if (stop <= end) continue;
    total += stop - Math.max(s.startMs, end);
    end = stop;
  }
  return total;
}

/** Wall time the spans cover inside [from, to]. Work outside the window does not count. */
export function busyWithin(spans: readonly Timed[], from: number, to: number): number {
  const clipped = spans.map((s) => ({ startMs: Math.max(s.startMs, from), durationMs: Math.min(s.startMs + s.durationMs, to) - Math.max(s.startMs, from) }));
  return busyMs(clipped.filter((s) => s.durationMs > 0));
}

/** Sum of the span durations: spans that run at the same time all count. */
export const totalMs = (spans: readonly Timed[]): number => spans.reduce((t, s) => t + s.durationMs, 0);
