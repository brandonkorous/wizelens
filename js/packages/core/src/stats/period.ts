// The period a page shows: a preset range ending now, or a custom from–to window; and what it is compared with.
import { COMPARE_LABEL, previousWindow, TIME_RANGES, type TimeRange, type TimeWindow, windowOf } from "./common.js";

/** "previous": the window of the same length right before; "week": the same window 7 days earlier. */
export type Compare = "previous" | "week";

const WEEK_MS = 7 * 24 * 60 * 60_000;
/** Custom windows are at least a minute long. */
const MIN_CUSTOM_MS = 60_000;
/** A custom end a little past now (clock skew) is still now. */
const FUTURE_SLACK_MS = 60_000;

const RANGES = Object.keys(TIME_RANGES) as TimeRange[];

/** The smallest preset that covers a duration: it keeps range-based choices (labels, host limits) sensible for custom windows. */
export function rangeCovering(ms: number): TimeRange {
  return RANGES.find((r) => TIME_RANGES[r].ms >= ms) ?? RANGES[RANGES.length - 1]!;
}

/** The custom window of `from` and `to` (epoch ms) in params, or null when they are missing or make no sense. */
export function customWindow(params: Readonly<Record<string, string>>, now: number): TimeWindow | null {
  const from = Math.floor(Number(params.from));
  const to = Math.floor(Number(params.to));
  if (!params.from || !params.to || !Number.isFinite(from) || !Number.isFinite(to) || to > now + FUTURE_SLACK_MS) return null;
  const end = Math.min(to, now);
  return end - from >= MIN_CUSTOM_MS ? { from, to: end } : null;
}

/** The window a page shows: the custom from–to in params, else the range ending now. */
export const periodWindow = (range: TimeRange, now: number, params: Readonly<Record<string, string>>): TimeWindow => customWindow(params, now) ?? windowOf(range, now);

export const compareOf = (params: Readonly<Record<string, string>>): Compare => (params.compare === "week" ? "week" : "previous");

/** The window a page compares with. */
export const compareWindow = (w: TimeWindow, compare: Compare): TimeWindow =>
  compare === "week" ? { from: w.from - WEEK_MS, to: w.to - WEEK_MS } : previousWindow(w);

/** "vs. previous day", "vs. same time last week", or "vs. previous period" for a custom window. */
export function compareLabelOf(range: TimeRange, custom: boolean, compare: Compare): string {
  if (compare === "week") return "vs. same time last week";
  return custom ? "vs. previous period" : COMPARE_LABEL[range];
}
