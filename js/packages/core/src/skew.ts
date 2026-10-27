import type { LogRecord, Span } from "./types.js";

// Services run on different clocks. A server span must sit inside the call that started it, so shift its service's part of the tree.

// A span never starts before its parent in its own service. Next.js dates clientComponentLoading from an old chunk load, so a 44 ms page read as 2,181 s.

const isCall = (s: Span) => s.category === "http.client" || s.category === "browser";

/** Shift (ms) for span `s`, given its already shifted parent and the shift the parent passed down. */
function offsetFor(s: Span, parent: Span | undefined, inherited: number): number {
  if (parent && parent.service === s.service && s.startMs + inherited < parent.startMs) return parent.startMs - s.startMs;
  if (!parent || s.category !== "http.server" || parent.service === s.service || !isCall(parent)) return inherited;
  const start = s.startMs + inherited;
  if (start >= parent.startMs && start + s.durationMs <= parent.startMs + parent.durationMs) return inherited;
  return parent.startMs + Math.max(0, (parent.durationMs - s.durationMs) / 2) - s.startMs;
}

const pathOf = (url: unknown): string | null => {
  try {
    return typeof url === "string" ? new URL(url).pathname : null;
  } catch {
    return null;
  }
};

// A cross-origin fetch sends no traceparent, so the server span has no parent; the page joins its trace from X-WizeLens-Trace.
function adoptedBy(spans: readonly Span[], ids: Set<string>): Map<string, Span> {
  const roots = spans.filter((s) => !s.parentSpanId || !ids.has(s.parentSpanId));
  const out = new Map<string, Span>();
  for (const server of roots.filter((s) => s.category === "http.server")) {
    const calls = roots.filter((b) => b.category === "browser" && b.service !== server.service && pathOf(b.attributes["url.full"]) === server.attributes["url.path"]);
    if (calls.length === 1) out.set(server.spanId, calls[0]!);
  }
  return out;
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
  const adopted = adoptedBy(spans, ids);
  for (const s of spans) if ((!s.parentSpanId || !ids.has(s.parentSpanId)) && !adopted.has(s.spanId)) visit(s, undefined, 0);
  for (const [id, call] of adopted) visit(spans.find((s) => s.spanId === id)!, out.find((s) => s.spanId === call.spanId), 0);
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
