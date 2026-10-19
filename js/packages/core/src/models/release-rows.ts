// Release rows: every version of every service (or one service), from the rel kind over all kept data.
import type { Release } from "../releases.js";
import { splitKey } from "../scale/kinds.js";
import type { GroupNeed, NeedResults } from "../scale/needs.js";
import { groupNeed, rowsOf } from "./read.js";

/** Most releases a page lists. */
export const RELEASES_MAX = 50;

/** The versions seen last over all kept data; one service's only when given. */
export const releasesNeed = (id: string, service?: string): GroupNeed =>
  groupNeed(id, "rel", "all", { order: { by: "lastMs", desc: true, limit: RELEASES_MAX }, ...(service ? { filter: { parts: [service, null] } } : {}) });

/** The releases of a need, newest first. */
export function releasesOf(d: NeedResults, id: string): Release[] {
  return rowsOf(d, id)
    .map((r) => {
      const [service = "", version = ""] = splitKey(r.key);
      return { service, version, firstMs: r.agg.firstMs, lastMs: r.agg.lastMs };
    })
    .sort((a, b) => b.firstMs - a.firstMs || a.version.localeCompare(b.version));
}

/** A first-seen time span, `to` not included. */
export interface Bounds {
  from: number;
  to: number;
}

/** First-seen bounds for the "new" and release filters: from `freshFrom` on, within one release's time, or both. Null for none. */
export function firstSeenBounds(d: NeedResults, id: string, release: string, freshFrom: number | null): Bounds | null {
  let b: Bounds | null = freshFrom === null ? null : { from: freshFrom, to: Number.POSITIVE_INFINITY };
  if (!release) return b;
  const all = releasesOf(d, id);
  const r = all.find((x) => x.version === release);
  const own = r ? { from: r.firstMs, to: releaseEnd(all, r) } : { from: Number.POSITIVE_INFINITY, to: Number.POSITIVE_INFINITY };
  b = b ? { from: Math.max(b.from, own.from), to: Math.min(b.to, own.to) } : own;
  return b;
}

export const inBounds = (b: Bounds, t: number): boolean => t >= b.from && t < b.to;

/** Where one release's time ends: when the next version of its service came out, or never (Infinity). */
export function releaseEnd(all: readonly Release[], r: Release): number {
  const next = all.filter((x) => x.service === r.service && x.firstMs > r.firstMs).map((x) => x.firstMs);
  return next.length ? Math.min(...next) : Number.POSITIVE_INFINITY;
}
