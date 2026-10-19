// The versions of one service compared: requests, error rate, and p95 in the range, and the error groups each one brought.
import { histPercentile } from "../scale/hist.js";
import { joinKey } from "../scale/kinds.js";
import type { Need, NeedResults } from "../scale/needs.js";
import { lifeNeed } from "./error-issues.js";
import { aggByKey, groupNeed, rowsOf } from "./read.js";
import { releaseEnd, releasesNeed, releasesOf } from "./release-rows.js";

/** Versions the service page compares, newest first. */
const VERSIONS_SHOWN = 10;

export interface VersionStat {
  version: string;
  /** When this version first sent data (over all kept data). */
  firstMs: number;
  lastMs: number;
  /** Requests and jobs in the range, and how many failed. */
  requests: number;
  errors: number;
  errorRate: number;
  p95Ms: number | null;
  /** Error groups first seen while this was the newest version. */
  newErrors: number;
}

/** Needs for the versions of a service, by display name. */
export const versionNeeds = (shown: string): Need[] => [
  releasesNeed("rel.all", shown),
  groupNeed("rel.cur", "rel", "cur", { filter: { parts: [shown, null] }, hist: true }),
  lifeNeed(shown),
];

/** The newest versions of a service with their numbers. */
export function versionsOf(d: NeedResults, shown: string): VersionStat[] {
  const all = releasesOf(d, "rel.all");
  const cur = aggByKey(d, "rel.cur");
  const firsts = rowsOf(d, "life").map((r) => r.agg.firstMs);
  return all.slice(0, VERSIONS_SHOWN).map((r) => {
    const a = cur.get(joinKey(shown, r.version));
    const end = releaseEnd(all, r);
    const n = a?.n ?? 0;
    return {
      version: r.version,
      firstMs: r.firstMs,
      lastMs: r.lastMs,
      requests: n,
      errors: a?.err ?? 0,
      errorRate: n ? (a?.err ?? 0) / n : 0,
      p95Ms: a?.hist && n ? histPercentile(a.hist, n, 95) : null,
      newErrors: firsts.filter((t) => t >= r.firstMs && t < end).length,
    };
  });
}
