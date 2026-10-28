import { avgOfAgg } from "../scale/agg.js";
import { FACT_SLOW_QUERY_MS } from "../scale/facts.js";
import { histPercentile } from "../scale/hist.js";
import type { Need, NeedResults, PageContext, PageDef } from "../scale/needs.js";
import { joinKey } from "../scale/kinds.js";
import { percentOf, previousWindow, TIME_RANGES, type TimeRange } from "../stats/common.js";
import { rawService } from "../stats/errors.js";
import type { ModelParams } from "./input.js";
import { logFilterOf, logListFilterOf } from "./logs.js";
import { groupNeed, listNeed, listOf, rowsOf, seriesNeed, totalOf } from "./read.js";

/** Slices of an uptime alert's window: a check's newest run is in the last slice that has runs. */
const UPTIME_SLICES = 60;

/** What an alert rule watches. */
export const ALERT_METRICS = {
  error_rate: { label: "Error rate", unit: "%" },
  p95_ms: { label: "p95 request duration", unit: "ms" },
  avg_ms: { label: "Average request duration", unit: "ms" },
  requests: { label: "Requests", unit: "" },
  new_errors: { label: "New error types", unit: "" },
  slow_queries: { label: "Slow queries", unit: "" },
  log_count: { label: "Log lines", unit: "" },
  new_security_risks: { label: "New security risks", unit: "" },
  uptime_failing: { label: "Uptime checks failing", unit: "" },
} as const;

export type AlertMetric = keyof typeof ALERT_METRICS;
/** A fixed line, or "above_normal": above the baseline, with the threshold as the number of spreads. */
export type AlertOp = ">" | "<" | ">=" | "<=" | "above_normal";

/** The fixed lines; "above_normal" is offered on its own, for the metrics with a baseline. */
export const ALERT_OPS: readonly AlertOp[] = [">", "<", ">=", "<="];
export const isAlertOp = (v: unknown): v is AlertOp => ALERT_OPS.includes(v as AlertOp) || v === "above_normal";
export const isAlertMetric = (v: unknown): v is AlertMetric => typeof v === "string" && v in ALERT_METRICS;

/** True when `value op threshold` holds. "above_normal" is judged against the baseline, never here. */
export function opHolds(op: AlertOp, value: number, threshold: number): boolean {
  if (op === "above_normal") return false;
  if (op === ">") return value > threshold;
  if (op === "<") return value < threshold;
  return op === ">=" ? value >= threshold : value <= threshold;
}

/** What a rule watches: one service (display name), or one endpoint of it ("GET /api/orders/{id}"). Empty for all. */
export interface AlertScope {
  service?: string;
  endpoint?: string;
}

/** Why a scope does not fit a metric, or null. */
export function alertScopeProblem(metric: AlertMetric, scope: AlertScope): string | null {
  if (scope.endpoint && !scope.service) return "An endpoint needs its service.";
  if (scope.endpoint && metric === "slow_queries") return "Slow queries are counted per service, not per endpoint.";
  if (scope.endpoint && metric === "new_security_risks") return "Security risks are counted per service, not per endpoint.";
  if ((scope.service || scope.endpoint) && metric === "log_count") return "A log alert picks its service in the log search.";
  if ((scope.service || scope.endpoint) && metric === "uptime_failing") return "An uptime alert watches every check of the project.";
  return null;
}

/** One endpoint's needs: its `svc.ep` row, or its error groups (`err.ge`). */
function endpointNeeds(metric: AlertMetric, service: string, endpoint: string): Need[] {
  if (metric === "new_errors") {
    const f = { filter: { prefix: `${service}|`, parts: [null, endpoint] } };
    return [groupNeed("err.cur", "err.ge", "cur", f), groupNeed("err.prev", "err.ge", "prev", f)];
  }
  if (metric === "slow_queries" || metric === "new_security_risks") return [];
  return [groupNeed("req", "svc.ep", "cur", { filter: { keys: [joinKey(`api:${rawService(service)}`, endpoint)] }, hist: metric === "p95_ms" })];
}

/** What an alert metric reads: request, error group, or database rollups of the window (and the one before, for "new"), or the lines of a log search. */
export function alertNeeds(metric: AlertMetric, scope: AlertScope = {}, search: ModelParams = {}): Need[] {
  if (metric === "log_count") return [listNeed("logs", "logs", "cur", { filter: logListFilterOf(logFilterOf(search)), limit: 0, count: true })];
  if (metric === "uptime_failing") return [seriesNeed("up", "up.chk", "cur", UPTIME_SLICES, { split: true })];
  const service = scope.service || undefined;
  if (service && scope.endpoint) return endpointNeeds(metric, service, scope.endpoint);
  const one = service ? { service } : {};
  switch (metric) {
    case "new_errors": {
      const f = service ? { filter: { prefix: `${service}|` } } : {};
      return [groupNeed("err.cur", "err.g", "cur", f), groupNeed("err.prev", "err.g", "prev", f)];
    }
    case "slow_queries":
      return [groupNeed("db", "db", "cur", one)];
    case "new_security_risks":
      return [groupNeed("sec.cur", "sec", "cur", one), groupNeed("sec.prev", "sec", "prev", one)];
    default:
      return [groupNeed("req", "req", "cur", { ...one, ...(metric === "p95_ms" ? { hist: true } : {}) })];
  }
}

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
    case "new_security_risks": {
      const before = new Set(rowsOf(d, "sec.prev").map((r) => r.key));
      return rowsOf(d, "sec.cur").filter((r) => !before.has(r.key)).length;
    }
    case "uptime_failing": {
      // Checks whose newest run in the window failed, so a check that is back up no longer counts; no runs is no data.
      const newest = Object.values(d.series.up?.byKey ?? {}).flatMap((slices) => slices.findLast((a) => a.n > 0) ?? []);
      return newest.length ? newest.filter((a) => a.err > 0).length : null;
    }
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
export const alertPage = (metric: AlertMetric, scope: AlertScope = {}, search: ModelParams = {}): PageDef<number | null> => ({
  needs: () => alertNeeds(metric, scope, search),
  model: (d) => alertValueOf(metric, d),
});

/** True when the value breaks the rule. No data never fires, except "requests < n" (traffic stopped). */
export function alertBreached(metric: AlertMetric, op: AlertOp, value: number | null, threshold: number): boolean {
  const v = value ?? (metric === "requests" ? 0 : null);
  if (v === null) return false;
  return opHolds(op, v, threshold);
}

/** Why a notice was sent: the rule broke, it is fine again, it still breaks (a reminder), or someone pressed Test. */
export type AlertNoticeState = "fired" | "resolved" | "remind" | "test";

const OP_WORDS: Record<AlertOp, string> = { ">": "above", "<": "below", ">=": "at or above", "<=": "at or below", above_normal: "above normal" };

/** "above 5%", "no longer above 5%", "still above 5%", or "alerts when above 5%": the rule, worded for the notice. */
export function conditionText(op: AlertOp, threshold: string, state: AlertNoticeState = "fired"): string {
  const rule = op === "above_normal" ? OP_WORDS[op] : `${OP_WORDS[op]} ${threshold}`;
  if (state === "resolved") return `no longer ${rule}`;
  if (state === "remind") return `still ${rule}`;
  return state === "test" ? `alerts when ${rule}` : rule;
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
