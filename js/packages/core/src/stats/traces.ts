import { ATTR_BROWSER_RENDER_MS, ATTR_LAYER, ATTR_PAGE, ATTR_ROUTED_MS, browserTypeOf } from "../attributes.js";
import { busyMs } from "../busy.js";
import { DEFAULT_SLOW_MS } from "../health.js";
import { entryServerSpan, findRootSpan } from "../trace.js";
import type { Span, Trace } from "../types.js";
import { avgOf, groupBy, series, type TimeWindow } from "./common.js";
import { requestOf } from "./requests.js";
import { isConsumer, isProducer, queueOf } from "./messaging.js";
import { databaseOf, hostOf } from "./services.js";

export type LayerKind = "browser" | "network" | "routing" | "handler" | "service" | "queue" | "database" | "external" | "render";

/** Time of one layer of a trace. Segments and times are ms from the trace start. */
export interface TraceLayer {
  key: string;
  label: string;
  kind: LayerKind;
  /** Own time in this layer: children in other layers are left out. */
  totalMs: number;
  segments: { startMs: number; durationMs: number }[];
  /** The browser row spans the whole request; it is not counted in shares. */
  envelope: boolean;
}

/** One piece of a trace's time: a layer, its owner, and its own ms. */
export interface TracePart {
  key: string;
  label: string;
  kind: LayerKind;
  owner: string;
  ms: number;
  segs: [number, number][];
}

const RANK: Record<LayerKind, number> = { browser: 0, network: 1, routing: 2, handler: 3, service: 4, queue: 5, external: 6, database: 7, render: 8 };
const num = (s: Span, k: string) => (typeof s.attributes[k] === "number" ? (s.attributes[k] as number) : null);
const end = (s: Span) => s.startMs + s.durationMs;

function gaps(outer: Span, inner: Span): [number, number][] {
  const all: [number, number][] = [[outer.startMs, inner.startMs], [end(inner), end(outer)]];
  return all.filter(([a, b]) => b > a);
}

function serverPart(s: Span, own: number): TracePart[] {
  const routed = Math.min(num(s, ATTR_ROUTED_MS) ?? 0, own);
  const code: TracePart = { key: `service:${s.service}`, label: s.service, kind: "service", owner: s.service, ms: own - routed, segs: [[s.startMs + routed, end(s)]] };
  if (routed <= 0) return [code];
  return [{ key: "routing", label: "Routing", kind: "routing", owner: s.service, ms: routed, segs: [[s.startMs, s.startMs + routed]] }, code];
}

function fetchParts(s: Span, child: Span | undefined, own: number): TracePart[] {
  const parts: TracePart[] = [{ key: "browser", label: "Browser", kind: "browser", owner: "Web App", ms: s.durationMs, segs: [[s.startMs, end(s)]] }];
  parts.push({ key: "network", label: "Network", kind: "network", owner: "Network", ms: own, segs: child ? gaps(s, child) : [[s.startMs, end(s)]] });
  const render = num(s, ATTR_BROWSER_RENDER_MS);
  if (render) parts.push({ key: "render", label: "Render", kind: "render", owner: "Web App", ms: render, segs: [[end(s), end(s) + render]] });
  return parts;
}

const pagePart = (key: string, label: string, kind: LayerKind, s: Span, from: number, to: number): TracePart =>
  ({ key: `page:${key}`, label, kind, owner: "Web App", ms: to - from, segs: [[s.startMs + from, s.startMs + to]] });

/** A page view as phases from the navigation start: server response, first paint, main content, load. */
function pageviewParts(s: Span): TracePart[] {
  const ttfb = num(s, ATTR_PAGE.ttfbMs);
  const fcp = num(s, ATTR_PAGE.fcpMs);
  const lcp = num(s, ATTR_PAGE.lcpMs);
  const load = num(s, ATTR_PAGE.loadMs);
  if (ttfb === null) return [pagePart("route", "Route render", "render", s, 0, num(s, ATTR_PAGE.renderMs) ?? s.durationMs)];
  const parts = [pagePart("document", "Server response (TTFB)", "network", s, 0, ttfb)];
  if (fcp !== null && fcp > ttfb) parts.push(pagePart("client", "Client render (first paint)", "render", s, ttfb, fcp));
  if (lcp !== null && fcp !== null && lcp > fcp) parts.push(pagePart("content", "Main content paint", "render", s, fcp, lcp));
  if (load !== null) parts.push(pagePart("load", "Page load", "browser", s, 0, load));
  return parts;
}

function spanParts(s: Span, kids: Span[]): TracePart[] {
  const own = Math.max(0, s.durationMs - busyMs(kids.filter((k) => !isConsumer(k))));
  const server = kids.find((k) => k.category === "http.server");
  const type = browserTypeOf(s);
  if (type === "fetch") return fetchParts(s, server, own);
  if (type === "pageview") return pageviewParts(s);
  if (type !== null) return [];
  if (s.category === "http.server") return serverPart(s, own);
  if (isProducer(s)) return [{ key: `queue:${queueOf(s)}`, label: queueOf(s), kind: "queue", owner: s.service, ms: own, segs: [[s.startMs, end(s)]] }];
  if (isConsumer(s)) return [{ key: `service:${s.service}`, label: s.service, kind: "service", owner: s.service, ms: own, segs: [[s.startMs, end(s)]] }];
  if (s.category === "db") return [{ key: `db:${databaseOf(s)}`, label: databaseOf(s), kind: "database", owner: s.service, ms: own, segs: [[s.startMs, end(s)]] }];
  if (s.category === "http.client" && server) return [{ key: "network", label: "Network", kind: "network", owner: "Network", ms: own, segs: gaps(s, server) }];
  if (s.category === "http.client") return [{ key: `ext:${hostOf(s)}`, label: hostOf(s), kind: "external", owner: s.service, ms: own, segs: [[s.startMs, end(s)]] }];
  if (s.attributes[ATTR_LAYER] === "handler") return [{ key: "handler", label: "Handler", kind: "handler", owner: s.service, ms: own, segs: [[s.startMs, end(s)]] }];
  return [{ key: `service:${s.service}`, label: s.service, kind: "service", owner: s.service, ms: own, segs: [] }];
}

/** Time a message sat in its queue: from the end of the send to the start of the handler. */
function queueWaits(trace: Trace): TracePart[] {
  const byId = new Map(trace.spans.map((s) => [s.spanId, s]));
  return trace.spans.filter(isConsumer).flatMap((s) => {
    const send = s.parentSpanId ? byId.get(s.parentSpanId) : undefined;
    if (!send || !isProducer(send) || s.startMs <= end(send)) return [];
    const label = `Queue wait (${queueOf(s)})`;
    return [{ key: `wait:${queueOf(s)}`, label, kind: "queue" as const, owner: queueOf(s), ms: s.startMs - end(send), segs: [[end(send), s.startMs]] as [number, number][] }];
  });
}

/** Every time part of one trace, before grouping into layers. */
export function traceParts(trace: Trace): TracePart[] {
  const kids = groupBy(trace.spans.filter((s) => s.parentSpanId), (s) => s.parentSpanId!);
  return [...trace.spans.flatMap((s) => spanParts(s, kids.get(s.spanId) ?? [])), ...queueWaits(trace)];
}

/** Where the time of one trace went, one row per layer, in time order. */
export function traceLayers(trace: Trace): TraceLayer[] {
  const rows: TraceLayer[] = [];
  for (const [key, parts] of groupBy(traceParts(trace), (p) => p.key)) {
    const segs = parts.flatMap((p) => p.segs).sort((a, b) => a[0] - b[0]);
    const first = parts[0]!;
    rows.push({
      key,
      label: first.label,
      kind: first.kind,
      totalMs: parts.reduce((t, p) => t + p.ms, 0),
      segments: segs.map(([a, b]) => ({ startMs: a - trace.startMs, durationMs: b - a })),
      envelope: first.kind === "browser",
    });
  }
  const startOf = (r: TraceLayer) => r.segments[0]?.startMs ?? Infinity;
  return rows.sort((a, b) => startOf(a) - startOf(b) || RANK[a.kind] - RANK[b.kind]);
}

export interface Bottleneck {
  key: string;
  label: string;
  kind: LayerKind | "owner";
  totalMs: number;
  /** Percent of all counted time. */
  share: number;
}

/** Share of time per layer (or per owning service) over many traces. */
export function bottlenecks(traces: readonly Trace[], by: "layer" | "service" = "layer"): Bottleneck[] {
  const parts = traces.flatMap(traceParts).filter((p) => p.kind !== "browser" && p.ms > 0 && !p.key.startsWith("page:"));
  const total = parts.reduce((t, p) => t + p.ms, 0);
  const groups = groupBy(parts, (p) => (by === "layer" ? p.key : p.owner));
  return [...groups]
    .map(([key, list]) => {
      const ms = list.reduce((t, p) => t + p.ms, 0);
      return { key, label: by === "layer" ? list[0]!.label : key, kind: by === "layer" ? list[0]!.kind : ("owner" as const), totalMs: ms, share: total ? (ms / total) * 100 : 0 };
    })
    .sort((a, b) => b.totalMs - a.totalMs);
}

export interface CriticalSpan {
  traceId: string;
  /** The project's label, when one read covers many projects (the cloud's "All projects"). */
  project?: string;
  spanId: string;
  name: string;
  service: string;
  layer: string;
  durationMs: number;
  startMs: number;
}

const layerLabel = (s: Span, kids: Span[]) => spanParts(s, kids).find((p) => p.kind !== "browser")?.label ?? s.service;

/** The slowest spans below the request root, across traces. */
export function criticalSpans(traces: readonly Trace[], limit = 10): CriticalSpan[] {
  const out: CriticalSpan[] = [];
  for (const t of traces) {
    const root = findRootSpan(t.spans);
    const firstServer = entryServerSpan(t.spans);
    const kids = groupBy(t.spans.filter((s) => s.parentSpanId), (s) => s.parentSpanId!);
    for (const s of t.spans) {
      if (s === root || s === firstServer || s.category === "browser") continue;
      out.push({ traceId: t.traceId, spanId: s.spanId, name: s.name, service: s.service, layer: layerLabel(s, kids.get(s.spanId) ?? []), durationMs: s.durationMs, startMs: s.startMs });
    }
  }
  return out.sort((a, b) => b.durationMs - a.durationMs).slice(0, limit);
}

/** Request duration when known (browser to paint), page view render time, else the trace duration. */
export function traceDurationOf(t: Trace): number {
  const request = requestOf(t);
  if (request) return request.durationMs;
  const view = t.spans.find((s) => browserTypeOf(s) === "pageview");
  return view ? (num(view, ATTR_PAGE.renderMs) ?? view.durationMs) : t.durationMs;
}

export interface TraceCards {
  count: number;
  avgSpans: number | null;
  slow: number;
  series: { count: (number | null)[]; avgSpans: (number | null)[]; slow: (number | null)[] };
}

/** Numbers for the stat cards of the Traces page. */
export function traceCards(traces: readonly Trace[], window: TimeWindow, buckets = 24, slowMs = DEFAULT_SLOW_MS): TraceCards {
  const slow = traces.filter((t) => traceDurationOf(t) >= slowMs);
  const at = (t: Trace) => t.startMs;
  return {
    count: traces.length,
    avgSpans: avgOf(traces.map((t) => t.spanCount)),
    slow: slow.length,
    series: {
      count: series(traces, at, window, buckets),
      avgSpans: series(traces, at, window, buckets, "avg", (t) => t.spanCount),
      slow: series(slow, at, window, buckets),
    },
  };
}
