// What the Problems page reads: services and their endpoints per bucket now and in earlier windows, versions, and error groups.
import { type BaselineMode, baselineModeOf, probeNeeds, shiftsOf } from "../anomaly/shifts.js";
import type { ErrorSeen, VersionSeen } from "../anomaly/causes.js";
import type { KeyBuckets } from "../anomaly/detect.js";
import type { Agg } from "../scale/agg.js";
import { splitKey } from "../scale/kinds.js";
import { type BucketCount, type Need, type NeedResults, type PageContext, windowOfRef, type WindowRef } from "../scale/needs.js";
import type { TimeRange, TimeWindow } from "../stats/common.js";
import { errorGroupOf } from "./errors.js";
import { META_NEEDS } from "./input.js";
import { groupNeed, rowsOf, seriesNeed, uniqueNeeds } from "./read.js";
import { edgeNeeds, serviceNeeds } from "./service-rows.js";

const MIN = 60_000;
/** Bucket size per range, on a fixed grid from the epoch, so buckets (and problem ids) stay put as time moves on. */
export const PROBLEM_BUCKET_MS: Record<TimeRange, number> = { "15m": MIN, "1h": 2.5 * MIN, "6h": 15 * MIN, "24h": 30 * MIN, "7d": 240 * MIN, "30d": 720 * MIN };

/** The page's grid: whole buckets from the one holding the window's start to the one holding now (still filling). */
export interface ProblemGrid {
  window: TimeWindow;
  buckets: BucketCount;
  bucketMs: number;
}

export function problemGrid(ctx: Pick<PageContext, "range" | "window" | "now">): ProblemGrid {
  const bucketMs = PROBLEM_BUCKET_MS[ctx.range];
  const from = Math.floor(ctx.window.from / bucketMs) * bucketMs;
  const to = Math.max(from + bucketMs, Math.ceil(Math.max(ctx.now, ctx.window.to) / bucketMs) * bucketMs);
  return { window: { from, to }, buckets: Math.round((to - from) / bucketMs), bucketMs };
}

/** The grid moved back like a shift ("cur-1w"), or the grid itself for "cur". */
const gridWindow = (g: ProblemGrid, shift: WindowRef): TimeWindow => windowOfRef({ window: g.window, prev: g.window, now: g.window.to }, shift);
/** Error groups read for "new error group" causes. */
const ERRORS_MAX = 500;
/** Versions and error groups checked against the week before. */
const BEFORE_KEYS_MAX = 200;

/** The two levels a baseline is kept at: Services rows and their endpoints (queries, calls). */
const LEVELS = [
  { id: "svc", kind: "svc" },
  { id: "ep", kind: "svc.ep" },
] as const;

const seriesId = (level: string, win: WindowRef) => `pb.${level}.${String(win)}`;

/** First needs: service rows and the call map, whether earlier weeks have data, versions, and error groups. */
export const problemNeeds = (): Need[] =>
  uniqueNeeds([
    ...META_NEEDS,
    ...serviceNeeds("cur"),
    ...edgeNeeds(),
    ...probeNeeds(),
    groupNeed("pb.ver", "svc.v", "cur"),
    groupNeed("pb.err", "err.g", "cur", { top: true, order: { by: "n", desc: true, limit: ERRORS_MAX } }),
  ]);

/** Error groups that did not happen in the window's first moments, newest first: the ones that may be new. */
function errorCandidates(d: NeedResults, ctx: PageContext): string[] {
  const rows = rowsOf(d, "pb.err").filter((r) => r.agg.firstMs > ctx.window.from);
  return rows.sort((a, b) => b.agg.firstMs - a.agg.firstMs || (a.key < b.key ? -1 : 1)).slice(0, BEFORE_KEYS_MAX).map((r) => r.key);
}

/** Second needs: the per-bucket series now and in every earlier window, and the week before for versions and errors. */
export function problemFollowUp(ctx: PageContext, first: NeedResults): Need[] {
  const g = problemGrid(ctx);
  const wins: WindowRef[] = ["cur", ...shiftsOf(baselineModeOf(first))];
  const series = LEVELS.flatMap((l) => wins.map((w) => seriesNeed(seriesId(l.id, w), l.kind, gridWindow(g, w), g.buckets, { split: true, hist: true })));
  const versions = rowsOf(first, "pb.ver").map((r) => r.key).slice(0, BEFORE_KEYS_MAX);
  const errors = errorCandidates(first, ctx);
  return [
    ...series,
    ...(versions.length ? [groupNeed("pb.ver.before", "svc.v", "before", { filter: { keys: versions } })] : []),
    ...(errors.length ? [groupNeed("pb.err.before", "err.g", "before", { filter: { keys: errors } })] : []),
  ];
}

const nOf = (list: readonly Agg[]) => list.reduce((t, a) => t + a.n, 0);

/** Every key's buckets now, with the earlier windows that have data for it. */
export function keyBucketsOf(d: NeedResults, mode: BaselineMode): KeyBuckets[] {
  const shifts = shiftsOf(mode);
  return LEVELS.flatMap((l) => {
    const cur = d.series[seriesId(l.id, "cur")]?.byKey ?? {};
    const earlier = shifts.map((s) => d.series[seriesId(l.id, s)]?.byKey ?? {});
    return Object.entries(cur).map(([key, list]) => ({ key, cur: list, samples: earlier.map((e) => e[key]).filter((s): s is Agg[] => !!s && nOf(s) > 0) }));
  });
}

/** How many earlier windows have any service data. */
export function samplesOf(d: NeedResults, mode: BaselineMode): number {
  return shiftsOf(mode).filter((s) => Object.values(d.series[seriesId("svc", s)]?.byKey ?? {}).some((list) => nOf(list) > 0)).length;
}

/** Versions in the window, and whether the week before had them. */
export function versionsSeenOf(d: NeedResults): VersionSeen[] {
  const before = new Set(rowsOf(d, "pb.ver.before").map((r) => r.key));
  return rowsOf(d, "pb.ver").map((r) => {
    const [service = "", version = ""] = splitKey(r.key);
    return { service, version, firstMs: r.agg.firstMs, isNew: !before.has(r.key) };
  });
}

/** Error groups in the window, and whether the week before had them. Only the candidates can be new. */
export function errorsOf(d: NeedResults, ctx: PageContext): ErrorSeen[] {
  const before = new Set(rowsOf(d, "pb.err.before").map((r) => r.key));
  const candidates = new Set(errorCandidates(d, ctx));
  return rowsOf(d, "pb.err").map((r) => {
    const g = errorGroupOf(r);
    return { key: g.key, service: g.service, type: g.type, message: g.message, firstMs: g.firstSeenMs, count: g.count, isNew: candidates.has(r.key) && !before.has(r.key) };
  });
}
