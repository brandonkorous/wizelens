import type { Health } from "../health.js";
import { series } from "../stats/common.js";
import { insightGroups } from "../stats/insights.js";
import { requestOf } from "../stats/requests.js";
import { type Bottleneck, bottlenecks, type CriticalSpan, criticalSpans, traceCards, type TraceCards, traceDurationOf } from "../stats/traces.js";
import type { Trace } from "../types.js";
import { type ModelInput, type ModelMeta, metaOf } from "./input.js";

const BUCKETS = 24;
const RECENT = 10;

/** One row of the recent traces list. */
export interface TraceListItem {
  traceId: string;
  path: string;
  durationMs: number;
  /** Request health when the trace is a request; else null, and `status` decides the color. */
  health: Health | null;
  status: Trace["status"];
  services: string[];
}

export interface TracesModel {
  meta: ModelMeta;
  cards: { cur: TraceCards; prev: TraceCards; insights: number; prevInsights: number | null; insightSeries: (number | null)[] };
  recent: TraceListItem[];
  matching: number;
  bottlenecks: { layer: Bottleneck[]; service: Bottleneck[] };
  critical: CriticalSpan[];
  /** The `trace` parameter's trace, else the newest one. */
  selected: Trace | null;
}

/** The path of a trace's root URL, or its name. */
export function tracePath(t: Pick<Trace, "rootUrl" | "rootName">): string {
  const url = t.rootUrl ?? t.rootName;
  if (!/^https?:\/\//.test(url)) return url;
  const u = new URL(url);
  return u.pathname + u.search;
}

export const traceListItem = (t: Trace): TraceListItem => ({
  traceId: t.traceId,
  path: tracePath(t),
  durationMs: traceDurationOf(t),
  health: requestOf(t)?.health ?? null,
  status: t.status,
  services: t.services,
});

function matches(t: Trace, q: string): boolean {
  return !q || t.traceId.startsWith(q) || tracePath(t).toLowerCase().includes(q) || t.services.some((s) => s.toLowerCase().includes(q));
}

/** The Traces page. Params: q (search), trace (selected id). */
export function tracesModel(i: ModelInput): TracesModel {
  const q = (i.params.q ?? "").trim().toLowerCase();
  const found = i.traces.filter((t) => matches(t, q));
  const wanted = i.params.trace;
  const selected = (wanted && (i.traces.find((t) => t.traceId === wanted) ?? i.prevTraces.find((t) => t.traceId === wanted))) || i.traces[0] || null;
  return {
    meta: metaOf(i),
    cards: {
      cur: traceCards(i.traces, i.window, BUCKETS),
      prev: traceCards(i.prevTraces, i.prev, BUCKETS),
      insights: insightGroups(i.traces).length,
      prevInsights: i.prevTraces.length ? insightGroups(i.prevTraces).length : null,
      insightSeries: series(i.requests, (r) => r.startMs, i.window, BUCKETS, "sum", (r) => r.insights),
    },
    recent: found.slice(0, RECENT).map(traceListItem),
    matching: found.length,
    bottlenecks: { layer: bottlenecks(i.traces, "layer").slice(0, 8), service: bottlenecks(i.traces, "service").slice(0, 8) },
    critical: criticalSpans(i.traces, 25),
    selected,
  };
}
