import { ATTR_BROWSER_ROUTE, ATTR_REACT_COMPONENTS, browserTypeOf, type ReactComponentStat } from "../attributes.js";
import type { Span, Trace } from "../types.js";
import type { Impact } from "./common.js";

/** One React component, summed over all render reports in the traces. */
export interface ComponentRow {
  name: string;
  renders: number;
  /** Average time per render, children included. */
  avgMs: number;
  /** Time in the component itself, summed. */
  selfMs: number;
  /** Time with children, summed. */
  totalMs: number;
  wasted: number;
  context: number;
  impact: Impact;
  issues: string[];
  routes: string[];
  lastSeenMs: number;
  exampleTraceId: string;
}

const SLOW_RENDER_MS = 16;
// Below this much own time in total, a component is not worth an insight, however often it renders.
const MIN_INSIGHT_MS = 1;
const FREQUENT_PER_VIEW = 20;
const FREQUENT_NO_VIEWS = 50;

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** The component stats in one react span. Bad or missing JSON gives an empty list. */
export function componentStatsOf(span: Span): ReactComponentStat[] {
  const raw = span.attributes[ATTR_REACT_COMPONENTS];
  if (typeof raw !== "string") return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.flatMap((x) => {
      const o = x as Record<string, unknown> | null;
      if (!o || typeof o.name !== "string" || !o.name) return [];
      return [{ name: o.name, renders: num(o.renders), actualMs: num(o.actualMs), selfMs: num(o.selfMs), wasted: num(o.wasted), context: num(o.context) }];
    });
  } catch {
    return [];
  }
}

interface Acc extends ReactComponentStat {
  routes: Set<string>;
  lastSeenMs: number;
  exampleTraceId: string;
}

function add(acc: Map<string, Acc>, stat: ReactComponentStat, span: Span): void {
  const route = span.attributes[ATTR_BROWSER_ROUTE];
  const a = acc.get(stat.name) ?? { name: stat.name, renders: 0, actualMs: 0, selfMs: 0, wasted: 0, context: 0, routes: new Set<string>(), lastSeenMs: 0, exampleTraceId: span.traceId };
  a.renders += stat.renders;
  a.actualMs += stat.actualMs;
  a.selfMs += stat.selfMs;
  a.wasted += stat.wasted;
  a.context += stat.context;
  if (typeof route === "string" && route) a.routes.add(route);
  if (span.startMs >= a.lastSeenMs) Object.assign(a, { lastSeenMs: span.startMs, exampleTraceId: span.traceId });
  acc.set(stat.name, a);
}

/** Issue texts for one component. `views` is the number of page views in the same traces. */
export function componentIssues(c: Pick<ReactComponentStat, "renders" | "selfMs" | "wasted" | "context">, views: number): string[] {
  const issues: string[] = [];
  if (c.selfMs < MIN_INSIGHT_MS) return issues;
  const frequent = views > 0 ? c.renders / views > FREQUENT_PER_VIEW : c.renders > FREQUENT_NO_VIEWS;
  if (frequent) issues.push("Re-renders frequently");
  if (c.wasted >= 5 && c.wasted / Math.max(1, c.renders) >= 0.3) issues.push("Re-renders with the same props");
  if (c.context >= 5 && c.context / Math.max(1, c.renders) >= 0.5) issues.push("Context value changes often");
  if (c.renders > 0 && c.selfMs / c.renders >= SLOW_RENDER_MS) issues.push("Slow render");
  return issues;
}

/** Impact from the component's share of all own render time. */
export function componentImpact(totalMs: number, allMs: number): Impact {
  const share = allMs > 0 ? totalMs / allMs : 0;
  return share >= 0.2 ? "high" : share >= 0.05 ? "medium" : "low";
}

/** React components seen in the traces, most own render time first. Children are not counted, so wrappers do not rank high. */
export function componentRows(traces: readonly Trace[], views: number): ComponentRow[] {
  const acc = new Map<string, Acc>();
  for (const t of traces) {
    for (const s of t.spans) if (browserTypeOf(s) === "react") for (const stat of componentStatsOf(s)) add(acc, stat, s);
  }
  const allMs = [...acc.values()].reduce((sum, a) => sum + a.selfMs, 0);
  return [...acc.values()]
    .map((a) => ({
      name: a.name,
      renders: a.renders,
      avgMs: a.renders > 0 ? a.actualMs / a.renders : 0,
      selfMs: a.selfMs,
      totalMs: a.actualMs,
      wasted: a.wasted,
      context: a.context,
      impact: componentImpact(a.selfMs, allMs),
      issues: componentIssues(a, views),
      routes: [...a.routes].sort(),
      lastSeenMs: a.lastSeenMs,
      exampleTraceId: a.exampleTraceId,
    }))
    .sort((a, b) => b.selfMs - a.selfMs || b.renders - a.renders);
}
