// Baselines and the "above normal" test: plain statistics over the same time in earlier weeks (or days). No model, no training.
import type { Agg } from "../scale/agg.js";
import { histPercentile } from "../scale/hist.js";

/** What a baseline is kept for: error rate (%), p95 duration (ms), and traffic (count per bucket). */
export const ANOMALY_METRICS = ["error_rate", "p95_ms", "requests"] as const;
export type AnomalyMetric = (typeof ANOMALY_METRICS)[number];

export const isAnomalyMetric = (v: unknown): v is AnomalyMetric => typeof v === "string" && (ANOMALY_METRICS as readonly string[]).includes(v);

/** How many spreads above normal a value must be: high sensitivity fires sooner. */
export const SENSITIVITY = { high: 2, medium: 3, low: 4 } as const;
export type Sensitivity = keyof typeof SENSITIVITY;

export const isSensitivity = (v: unknown): v is Sensitivity => typeof v === "string" && Object.hasOwn(SENSITIVITY, v);

/** The default number of spreads ("medium"). */
export const DEFAULT_SPREADS = SENSITIVITY.medium;
/** Earlier weeks (or days) with data that a baseline needs before it judges anything. */
export const MIN_SAMPLES = 2;
/** Least traffic before a spike counts, so a quiet hour with 3 requests is not a problem. */
export const MIN_REQUESTS = 10;
/** Least failures before an error rate counts. */
export const MIN_ERRORS = 5;
/** Least measured items before a p95 counts. */
export const MIN_P95_ITEMS = 10;

/** One bucket judged against its baseline. */
export interface Verdict {
  value: number;
  /** The mean of the earlier samples. */
  normal: number;
  /** Values above this are above normal. */
  upper: number;
  above: boolean;
}

/** Requests people made: the count less bots and scanners (counter c0 of `svc` and `svc.ep`). */
const peopleOf = (a: Agg): number => Math.max(0, a.n - (a.c[0] ?? 0));

/** A metric in one bucket: the percent that failed, the p95 in ms, or the count without bots. Null when not measured. */
export function metricValue(metric: AnomalyMetric, a: Agg): number | null {
  if (metric === "requests") return peopleOf(a);
  if (a.n <= 1e-9) return null;
  if (metric === "error_rate") return (a.err / a.n) * 100;
  return a.hist ? histPercentile(a.hist, a.n, 95) : null;
}

function meanSd(xs: readonly number[]): { mean: number; sd: number } {
  const mean = xs.reduce((t, x) => t + x, 0) / xs.length;
  const v = xs.length > 1 ? xs.reduce((t, x) => t + (x - mean) ** 2, 0) / (xs.length - 1) : 0;
  return { mean, sd: Math.sqrt(v) };
}

/** The smallest spread a metric allows, so a flat history does not make every wiggle a problem. */
function spreadOf(metric: AnomalyMetric, mean: number, sd: number, cur: Agg): number {
  if (metric === "requests") return Math.max(sd, Math.sqrt(Math.max(mean, 1)), 0.1 * mean);
  if (metric === "error_rate") {
    const p = Math.min(1, Math.max(0, mean / 100));
    return Math.max(sd, 100 * Math.sqrt((p * (1 - p)) / Math.max(cur.n, 1)), 0.5);
  }
  return Math.max(sd, 0.1 * mean, 5);
}

/** True when the bucket has enough data for its value to mean something. */
export function enoughData(metric: AnomalyMetric, cur: Agg): boolean {
  if (metric === "requests") return peopleOf(cur) >= MIN_REQUESTS;
  if (metric === "error_rate") return cur.err >= MIN_ERRORS;
  return cur.n >= MIN_P95_ITEMS;
}

/** Judge one bucket against the same bucket in earlier weeks (or days). Null without a value or enough samples. */
export function judge(metric: AnomalyMetric, cur: Agg, samples: readonly Agg[], spreads: number = DEFAULT_SPREADS): Verdict | null {
  const value = metricValue(metric, cur);
  const base = samples.map((a) => metricValue(metric, a)).filter((v): v is number => v !== null);
  if (value === null || base.length < MIN_SAMPLES) return null;
  const { mean, sd } = meanSd(base);
  const upper = mean + spreads * spreadOf(metric, mean, sd, cur);
  return { value, normal: mean, upper, above: enoughData(metric, cur) && value > upper };
}

/** How far over the line a verdict is: 1 at the line, 2 at twice it. */
export const overBy = (v: Verdict): number => (v.upper > 0 ? v.value / v.upper : 0);
