import { avgOf, percentileOf } from "../stats/common.js";
import { dbCalls } from "../stats/database.js";
import { errorEvents, errorGroups, errorRateOf } from "../stats/errors.js";
import { requestRows } from "../stats/requests.js";
import type { Trace } from "../types.js";

/** What an alert rule watches. */
export const ALERT_METRICS = {
  error_rate: { label: "Error rate", unit: "%" },
  p95_ms: { label: "p95 request duration", unit: "ms" },
  avg_ms: { label: "Average request duration", unit: "ms" },
  requests: { label: "Requests", unit: "" },
  new_errors: { label: "New error types", unit: "" },
  slow_queries: { label: "Slow queries", unit: "" },
} as const;

export type AlertMetric = keyof typeof ALERT_METRICS;
export type AlertOp = ">" | "<";

export const isAlertMetric = (v: unknown): v is AlertMetric => typeof v === "string" && v in ALERT_METRICS;

/** The value of a metric over one window. `prevTraces` is the window before, for "new" errors. Null when there is no data. */
export function alertValue(metric: AlertMetric, traces: readonly Trace[], prevTraces: readonly Trace[], slowQueryMs = 100): number | null {
  const rows = requestRows(traces);
  const durations = rows.map((r) => r.durationMs);
  switch (metric) {
    case "error_rate":
      return rows.length ? errorRateOf(rows) : null;
    case "p95_ms":
      return percentileOf(durations, 95);
    case "avg_ms":
      return avgOf(durations);
    case "requests":
      return rows.length;
    case "new_errors": {
      const before = new Set(errorGroups(errorEvents(prevTraces)).map((g) => g.key));
      return errorGroups(errorEvents(traces)).filter((g) => !before.has(g.key)).length;
    }
    case "slow_queries":
      return dbCalls(traces).filter((c) => c.durationMs >= slowQueryMs).length;
  }
}

/** True when the value breaks the rule. No data never fires, except "requests < n" (traffic stopped). */
export function alertBreached(metric: AlertMetric, op: AlertOp, value: number | null, threshold: number): boolean {
  const v = value ?? (metric === "requests" ? 0 : null);
  if (v === null) return false;
  return op === ">" ? v > threshold : v < threshold;
}

/** "Error rate is 7.5% (above 5%)". */
export function alertMessage(metric: AlertMetric, op: AlertOp, value: number | null, threshold: number): string {
  const m = ALERT_METRICS[metric];
  const fmt = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}${m.unit === "%" ? "%" : m.unit ? ` ${m.unit}` : ""}`;
  return `${m.label} is ${value === null ? "not measured" : fmt(value)} (${op === ">" ? "above" : "below"} ${fmt(threshold)})`;
}
