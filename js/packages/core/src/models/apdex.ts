// Apdex: how many requests felt fast (at or under the target), tolerable (under four times it), or frustrating, as 0 to 1.
import type { Agg } from "../scale/agg.js";
import { histCountAtMost } from "../scale/hist.js";

/** The target when a service has none set. */
export const DEFAULT_APDEX_MS = 500;

/** Targets per service (display name), in ms. */
export type ApdexTargets = Readonly<Record<string, number>>;

export interface Apdex {
  /** 0 (all frustrated) to 1 (all satisfied); null with no requests. */
  score: number | null;
  targetMs: number;
  satisfied: number;
  tolerating: number;
  frustrated: number;
}

export const apdexTargetOf = (targets: ApdexTargets | undefined, service: string): number => targets?.[service] ?? DEFAULT_APDEX_MS;

/** Apdex of some requests. Failed ones count as frustrated; durations come from the histogram (bin width about 4%). */
export function apdexOf(a: Pick<Agg, "n" | "err" | "hist">, targetMs: number): Apdex {
  if (!a.n || !a.hist) return { score: null, targetMs, satisfied: 0, tolerating: 0, frustrated: a.n };
  const ok = (a.n - a.err) / a.n;
  const satisfied = histCountAtMost(a.hist, targetMs) * ok;
  const tolerating = (histCountAtMost(a.hist, 4 * targetMs) - histCountAtMost(a.hist, targetMs)) * ok;
  return { score: (satisfied + tolerating / 2) / a.n, targetMs, satisfied, tolerating, frustrated: a.n - satisfied - tolerating };
}

/** Apdex of several services together, each against its own target. */
export function apdexOfMany(parts: readonly Apdex[]): Apdex | null {
  const n = parts.reduce((t, p) => t + p.satisfied + p.tolerating + p.frustrated, 0);
  if (!n) return null;
  const sum = (k: "satisfied" | "tolerating" | "frustrated") => parts.reduce((t, p) => t + p[k], 0);
  const targets = new Set(parts.map((p) => p.targetMs));
  return { score: (sum("satisfied") + sum("tolerating") / 2) / n, targetMs: targets.size === 1 ? parts[0]!.targetMs : 0, satisfied: sum("satisfied"), tolerating: sum("tolerating"), frustrated: sum("frustrated") };
}

/** "Excellent" (0.94 and up), "Good", "Fair", "Poor", or "Unacceptable" (under 0.5). */
export function apdexRating(score: number): string {
  if (score >= 0.94) return "Excellent";
  if (score >= 0.85) return "Good";
  if (score >= 0.7) return "Fair";
  return score >= 0.5 ? "Poor" : "Unacceptable";
}
