import type { LogRecord, Span } from "./types.js";

// Services run on different clocks. A server span must sit inside the call that started it, so shift its service's part of the tree.

const isCall = (s: Span) => s.category === "http.client" || s.category === "browser";

/** Shift (ms) for span `s`, given its already shifted parent and the shift the parent passed down. */
function offsetFor(s: Span, parent: Span | undefined, inherited: number): number {
  if (!parent || s.category !== "http.server" || parent.service === s.service || !isCall(parent)) return inherited;
  const start = s.startMs + inherited;
  if (start >= parent.startMs && start + s.durationMs <= parent.startMs + parent.durationMs) return inherited;
  return parent.startMs + Math.max(0, (parent.durationMs - s.durationMs) / 2) - s.startMs;
}

/** Spans with cross-service clock skew removed, and the shift applied to each span id. */
export function adjustClockSkew(spans: readonly Span[]): { spans: Span[]; offsets: Map<string, number> } {
  const ids = new Set(spans.map((s) => s.spanId));
  const kids = new Map<string, Span[]>();
  for (const s of spans) {
    if (!s.parentSpanId || !ids.has(s.parentSpanId)) continue;
    const list = kids.get(s.parentSpanId);
    if (list) list.push(s);
    else kids.set(s.parentSpanId, [s]);
  }
  const offsets = new Map<string, number>();
  const out: Span[] = [];
  const visit = (s: Span, parent: Span | undefined, inherited: number) => {
    if (offsets.has(s.spanId)) return;
    const offset = offsetFor(s, parent, inherited);
    offsets.set(s.spanId, offset);
    const shifted = offset ? { ...s, startMs: s.startMs + offset } : s;
    out.push(shifted);
    for (const k of kids.get(s.spanId) ?? []) visit(k, shifted, offset);
  };
  for (const s of spans) if (!s.parentSpanId || !ids.has(s.parentSpanId)) visit(s, undefined, 0);
  for (const s of spans) if (!offsets.has(s.spanId)) visit(s, undefined, 0);
  return { spans: out, offsets };
}

/** Logs moved by the same shift as the span they belong to. */
export function shiftLogs(logs: readonly LogRecord[], offsets: Map<string, number>): LogRecord[] {
  return logs.map((l) => {
    const offset = l.spanId ? (offsets.get(l.spanId) ?? 0) : 0;
    return offset ? { ...l, timeMs: l.timeMs + offset } : l;
  });
}
