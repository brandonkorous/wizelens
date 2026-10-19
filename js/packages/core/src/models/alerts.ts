import { avgOfAgg } from "../scale/agg.js";
import { FACT_SLOW_QUERY_MS } from "../scale/facts.js";
import { histPercentile } from "../scale/hist.js";
import type { Need, NeedResults, PageContext, PageDef } from "../scale/needs.js";
import { percentOf, previousWindow, TIME_RANGES, type TimeRange } from "../stats/common.js";
import type { ModelParams } from "./input.js";
import { logFilterOf, logListFilterOf } from "./logs.js";
import { groupNeed, listNeed, listOf, rowsOf, totalOf } from "./read.js";

/** What an alert rule watches. */
export const ALERT_METRICS = {
  error_rate: { label: "Error rate", unit: "%" },
  p95_ms: { label: "p95 request duration", unit: "ms" },
  avg_ms: { label: "Average request duration", unit: "ms" },
  requests: { label: "Requests", unit: "" },
  new_errors: { label: "New error types", unit: "" },
  slow_queries: { label: "Slow queries", unit: "" },
  log_count: { label: "Log lines", unit: "" },
} as const;

export type AlertMetric = keyof typeof ALERT_METRICS;
export type AlertOp = ">" | "<";

export const isAlertMetric = (v: unknown): v is AlertMetric => typeof v === "string" && v in ALERT_METRICS;

const ALERT_NEEDS: Record<AlertMetric, readonly Need[]> = {
  error_rate: [groupNeed("req", "req", "cur")],
  p95_ms: [groupNeed("req", "req", "cur", { hist: true })],
  avg_ms: [groupNeed("req", "req", "cur")],
  requests: [groupNeed("req", "req", "cur")],
  new_errors: [groupNeed("err.cur", "err.g", "cur"), groupNeed("err.prev", "err.g", "prev")],
  slow_queries: [groupNeed("db", "db", "cur")],
  log_count: [],
};

/** What an alert metric reads: request, error group, or database rollups of the window (and the one before, for "new"), or the lines of a log search. */
export const alertNeeds = (metric: AlertMetric, search: ModelParams = {}): Need[] =>
  metric === "log_count" ? [listNeed("logs", "logs", "cur", { filter: logListFilterOf(logFilterOf(search)), limit: 0, count: true })] : [...ALERT_NEEDS[metric]];

/** The value of a metric over its window, from the answers to `alertNeeds`. Null when there is no data. */
export function alertValueOf(metric: AlertMetric, d: NeedResults): number | null {
  const req = totalOf(d, "req");
  switch (metric) {
    case "error_rate":
      return req.n ? percentOf(req.err, req.n) : null;
    case "p95_ms":
      return req.hist ? histPercentile(req.hist, req.n, 95) : null;
    case "avg_ms":
      return avgOfAgg(req);
    case "requests":
      return req.n;
    case "new_errors": {
      const before = new Set(rowsOf(d, "err.prev").map((r) => r.key));
      return rowsOf(d, "err.cur").filter((r) => !before.has(r.key)).length;
    }
    case "log_count":
      return listOf(d, "logs").total ?? 0;
    case "slow_queries":
      return totalOf(d, "db").c[0] ?? 0;
  }
}

/** A range label for a context; alert needs only read the windows. */
const rangeFor = (windowMs: number): TimeRange => (Object.keys(TIME_RANGES) as TimeRange[]).find((r) => TIME_RANGES[r].ms >= windowMs) ?? "30d";

/** The context of a rule: the window [now - windowMs, now) and the one right before it. */
export function alertContext(windowMs: number, now: number, options = { slowQueryMs: FACT_SLOW_QUERY_MS }): PageContext {
  const window = { from: now - windowMs, to: now };
  return { range: rangeFor(windowMs), window, prev: previousWindow(window), now, params: {}, options, settling: null };
}

/** An alert metric as a page, so hosts run it with `computePage` like any page. */
export const alertPage = (metric: AlertMetric, search: ModelParams = {}): PageDef<number | null> => ({ needs: () => alertNeeds(metric, search), model: (d) => alertValueOf(metric, d) });

/** True when the value breaks the rule. No data never fires, except "requests < n" (traffic stopped). */
export function alertBreached(metric: AlertMetric, op: AlertOp, value: number | null, threshold: number): boolean {
  const v = value ?? (metric === "requests" ? 0 : null);
  if (v === null) return false;
  return op === ">" ? v > threshold : v < threshold;
}

/** Why a notice was sent: the rule broke, it is fine again, or someone pressed Test. */
export type AlertNoticeState = "fired" | "resolved" | "test";

/** "above 5%", "no longer above 5%", or "alerts when above 5%": the rule, worded for the notice. */
export function conditionText(op: AlertOp, threshold: string, state: AlertNoticeState = "fired"): string {
  const rule = `${op === ">" ? "above" : "below"} ${threshold}`;
  return state === "resolved" ? `no longer ${rule}` : state === "test" ? `alerts when ${rule}` : rule;
}

/** A log search in words, for notices and lists: `error and up, service api, "timeout"`, or "" for every line. */
export function logSearchText(search: ModelParams): string {
  const f = logFilterOf(search);
  const level = f.minLevel === "trace" ? [] : [f.exact ? f.minLevel : `${f.minLevel} and up`];
  const origin = f.origin === "outside" ? ["outside requests"] : f.origin === "request" ? ["in requests"] : [];
  const named = [f.service && `service ${f.service}`, f.category && `category ${f.category}`, f.pattern && `pattern ${f.pattern}`, f.query && `"${f.query}"`];
  return [...level, ...origin, ...named].filter(Boolean).join(", ");
}

/** "Error rate is 7.5% (above 5%)"; a log count names its search: "Log lines (error and up) is 12 (above 5)". */
export function alertMessage(metric: AlertMetric, op: AlertOp, value: number | null, threshold: number, state: AlertNoticeState = "fired", search: ModelParams = {}): string {
  const m = ALERT_METRICS[metric];
  const fmt = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}${m.unit === "%" ? "%" : m.unit ? ` ${m.unit}` : ""}`;
  const what = metric === "log_count" && logSearchText(search) ? `${m.label} (${logSearchText(search)})` : m.label;
  return `${what} is ${value === null ? "not measured" : fmt(value)} (${conditionText(op, fmt(threshold), state)})`;
}
