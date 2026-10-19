// Which earlier windows a baseline reads: the same time in up to 4 earlier weeks, or in the 6 days before while weeks are missing.
import { groupNeed, totalOf } from "../models/read.js";
import type { Need, NeedResults, WindowRef } from "../scale/needs.js";
import { MIN_SAMPLES } from "./baseline.js";

/** "week" compares with the same hour of the week; "day" with the same hour of the day, for hosts that keep under two weeks. */
export type BaselineMode = "week" | "day";

export const WEEK_SHIFTS: readonly WindowRef[] = ["cur-1w", "cur-2w", "cur-3w", "cur-4w"];
export const DAY_SHIFTS: readonly WindowRef[] = ["cur-1d", "cur-2d", "cur-3d", "cur-4d", "cur-5d", "cur-6d"];

export const shiftsOf = (mode: BaselineMode): readonly WindowRef[] => (mode === "week" ? WEEK_SHIFTS : DAY_SHIFTS);

const probeId = (shift: WindowRef) => `probe.${String(shift)}`;

/** Needs that tell whether the earlier weeks have any traces. */
export const probeNeeds = (): Need[] => WEEK_SHIFTS.map((s) => groupNeed(probeId(s), "trace", s));

/** Weeks when at least two earlier weeks have traces, else days. */
export function baselineModeOf(d: NeedResults): BaselineMode {
  const weeks = WEEK_SHIFTS.filter((s) => totalOf(d, probeId(s)).n > 0).length;
  return weeks >= MIN_SAMPLES ? "week" : "day";
}
