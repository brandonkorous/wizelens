// Where a trace's time goes: each span's self time (not covered by its children) and the critical path (the chain that sets the end).
import type { Span, Trace } from "./types.js";

const endOf = (s: Span) => s.startMs + s.durationMs;

function childrenOf(spans: readonly Span[]): Map<string, Span[]> {
  const ids = new Set(spans.map((s) => s.spanId));
  const out = new Map<string, Span[]>();
  for (const s of spans) if (s.parentSpanId && ids.has(s.parentSpanId)) out.set(s.parentSpanId, [...(out.get(s.parentSpanId) ?? []), s]);
  return out;
}

/** Milliseconds of `[from, to)` that the intervals cover, counted once where they overlap. */
function covered(from: number, to: number, intervals: readonly [number, number][]): number {
  let total = 0;
  let end = from;
  for (const [a, b] of [...intervals].sort((x, y) => x[0] - y[0])) {
    const start = Math.max(a, end);
    const stop = Math.min(b, to);
    if (stop > start) total += stop - start;
    end = Math.max(end, Math.min(b, to));
  }
  return total;
}

/** Each span's self time: its duration minus the time its children run inside it (overlapping children count once). */
export function selfTimes(trace: Trace): Map<string, number> {
  const kids = childrenOf(trace.spans);
  const out = new Map<string, number>();
  for (const s of trace.spans) {
    const inside = (kids.get(s.spanId) ?? []).map((c): [number, number] => [c.startMs, endOf(c)]);
    out.set(s.spanId, Math.max(0, s.durationMs - covered(s.startMs, endOf(s), inside)));
  }
  return out;
}

/** The critical path: from each root, the child that ends last, and so on down. Their spans set when the trace ends. */
export function criticalPath(trace: Trace): Set<string> {
  const kids = childrenOf(trace.spans);
  const ids = new Set(trace.spans.map((s) => s.spanId));
  const roots = trace.spans.filter((s) => !s.parentSpanId || !ids.has(s.parentSpanId));
  const out = new Set<string>();
  let node: Span | undefined = roots.sort((a, b) => endOf(b) - endOf(a))[0];
  while (node) {
    out.add(node.spanId);
    node = [...(kids.get(node.spanId) ?? [])].sort((a, b) => endOf(b) - endOf(a) || a.startMs - b.startMs)[0];
  }
  return out;
}
