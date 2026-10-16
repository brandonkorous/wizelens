import type { FindingKind } from "../analysis.js";
import type { Trace } from "../types.js";
import { groupBy, type Impact, normalizeQuery, percentChange, series, type TimeWindow } from "./common.js";
import { type Headline, SPARK_BUCKETS } from "./overview.js";
import { renderInsightGroups } from "./rendering.js";
import { requestRows } from "./requests.js";

export type InsightKind = Exclude<FindingKind, "error"> | "render";
export type InsightArea = "database" | "http" | "render";

/** One problem seen in one or more requests, grouped by kind and shape. */
export interface InsightGroup {
  key: string;
  kind: InsightKind;
  area: InsightArea;
  impact: Impact;
  title: string;
  description: string;
  /** SQL text, HTTP shape, component, or route the insight is about. */
  shape: string;
  /** Requests (or page views) that had it. */
  occurrences: number;
  /** Total repeats over all occurrences. */
  count: number;
  /** Time spent in the spans involved. */
  totalMs: number;
  endpoints: string[];
  lastSeenMs: number;
  exampleTraceId: string;
}

interface Hit {
  kind: Exclude<FindingKind, "error">;
  shape: string;
  count: number;
  totalMs: number;
  endpoint: string;
  startMs: number;
  traceId: string;
}

const TITLES: Record<Hit["kind"], string> = {
  "n+1-db": "N+1 query pattern",
  "n+1-http": "Excessive fetch requests",
  "duplicate-query": "Repeated query opportunity",
  "slow-query": "Slow query opportunity",
  "db-wait": "Database wait",
};

/** "A query on Customers" from the SQL text, so similar insights read differently. */
function subjectOf(shape: string): string {
  const table = /\b(?:FROM|INTO|UPDATE)\s+["`[]?([\w.]+)/i.exec(shape)?.[1];
  return table ? `A query on ${table}` : "A query";
}

function describe(kind: Hit["kind"], shape: string, perRequest: number, avgMs: number, endpoint: string): string {
  const n = Math.round(perRequest);
  if (kind === "n+1-db") return `${subjectOf(shape)} runs ${n} times per request in ${endpoint}. Load the rows in one query (eager loading or a join).`;
  if (kind === "n+1-http") return `${endpoint} makes ${n} similar calls per request. Batch them or cache the result.`;
  if (kind === "duplicate-query") return `${subjectOf(shape)} runs ${n} times with the same parameters in ${endpoint}. Reuse the first result.`;
  if (kind === "db-wait") return `${n === 1 ? "A slow SET or BEGIN" : `${n} slow queries at the same time`} in ${endpoint} waited about ${Math.round(avgMs)} ms. They likely waited for a connection or a lock. Check the pool size, and whether it happens only on the first request.`;
  return `${subjectOf(shape)} takes ${Math.round(avgMs)} ms on average in ${endpoint}. Check its indexes and how many rows it reads.`;
}

function impactOf(kind: Hit["kind"], occurrences: number, totalMs: number, avgMs: number): Impact {
  if (kind === "slow-query" || kind === "db-wait") return avgMs >= 1000 ? "high" : avgMs >= 300 ? "medium" : "low";
  if (totalMs >= 500 || occurrences >= 20) return "high";
  return totalMs >= 100 || occurrences >= 5 ? "medium" : "low";
}

function hitsOf(traces: readonly Trace[]): Hit[] {
  const hits: Hit[] = [];
  for (const r of requestRows(traces)) {
    for (const f of r.findings) {
      if (f.kind === "error") continue;
      const shape = f.kind === "n+1-http" ? f.shape : normalizeQuery(f.shape);
      hits.push({ kind: f.kind, shape, count: f.count, totalMs: f.totalMs, endpoint: r.endpoint, startMs: r.startMs, traceId: r.traceId });
    }
  }
  return hits;
}

function toGroup(key: string, hits: Hit[]): InsightGroup {
  const first = hits[0]!;
  const count = hits.reduce((t, h) => t + h.count, 0);
  const totalMs = hits.reduce((t, h) => t + h.totalMs, 0);
  const endpoints = [...new Set(hits.map((h) => h.endpoint))];
  // A wait is one stretch of time per request; the others are per query.
  const avgMs = first.kind === "db-wait" ? totalMs / hits.length : totalMs / Math.max(1, count);
  const latest = hits.reduce((a, b) => (b.startMs > a.startMs ? b : a));
  return {
    key,
    kind: first.kind,
    area: first.kind === "n+1-http" ? "http" : "database",
    impact: impactOf(first.kind, hits.length, totalMs, avgMs),
    title: TITLES[first.kind],
    description: describe(first.kind, first.shape, count / hits.length, avgMs, endpoints[0]!),
    shape: first.shape,
    occurrences: hits.length,
    count,
    totalMs,
    endpoints,
    lastSeenMs: latest.startMs,
    exampleTraceId: latest.traceId,
  };
}

const IMPACT_RANK: Record<Impact, number> = { high: 0, medium: 1, low: 2 };

/** Insights from request analysis (N+1, duplicate, slow queries), grouped across requests. */
export function requestInsightGroups(traces: readonly Trace[]): InsightGroup[] {
  const groups = groupBy(hitsOf(traces), (h) => `${h.kind}|${h.shape}`);
  return [...groups].map(([key, hits]) => toGroup(key, hits));
}

/** "Insights Found": the distinct insights in the window, the same number the Insights page lists. */
export function insightHeadline(groups: readonly InsightGroup[], prev: readonly InsightGroup[] | null, w: TimeWindow, buckets = SPARK_BUCKETS): Headline {
  const previous = prev && prev.length > 0 ? prev.length : null;
  return { value: groups.length, previous, change: percentChange(groups.length, previous), series: series(groups, (g) => g.lastSeenMs, w, buckets) };
}

/** All insights: requests and rendering, most important first. */
export function insightGroups(traces: readonly Trace[]): InsightGroup[] {
  return [...requestInsightGroups(traces), ...renderInsightGroups(traces)].sort(
    (a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || b.totalMs - a.totalMs || b.lastSeenMs - a.lastSeenMs,
  );
}
