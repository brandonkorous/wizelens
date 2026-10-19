// Rollup changes when a trace settles: new contributions minus old ones, on every tier that still keeps the bucket.
import { COUNTER_SLOTS, KIND_SPEC, type RollupKind } from "./kinds.js";
import type { StoredContribution, StoredContributions } from "./compact.js";
import { isKept, TIERS, type Tier, type TierName } from "./window.js";

/** A change to one rollup row. */
export interface RollupDelta {
  tier: TierName;
  project: string;
  env: string;
  kind: RollupKind;
  key: string;
  bucket: number;
  n: number;
  err: number;
  sum: number;
  c: number[];
  /** Null when the change only takes away, so the stored first and last times stay. */
  firstMs: number | null;
  lastMs: number | null;
  /** Replaces the stored top when its rank is higher. Null when there is none. */
  top: unknown;
  topRank: number | null;
  /** Newest trace ids first, space-joined; "" when none. */
  ids: string;
}

/** A change to one histogram bin of one rollup row. */
export interface HistDelta {
  tier: TierName;
  project: string;
  env: string;
  kind: RollupKind;
  key: string;
  bucket: number;
  bin: number;
  cnt: number;
}

export interface SettleDelta {
  rollup: RollupDelta[];
  hist: HistDelta[];
}

const EPS = 1e-9;

function rowDelta(s: StoredContributions, r: StoredContribution, tier: Tier, sign: 1 | -1): RollupDelta {
  const c = new Array<number>(COUNTER_SLOTS).fill(0).map((_, i) => sign * (r.c?.[i] ?? 0));
  const adds = sign > 0;
  const ids = adds && KIND_SPEC[r.k].ids > 0 ? s.traceId : "";
  const top = adds && r.r !== undefined ? { top: r.t ?? null, topRank: r.r } : { top: null, topRank: null };
  const bucket = Math.floor(r.b / tier.ms) * tier.ms;
  return { tier: tier.name, project: s.project, env: s.env, kind: r.k, key: r.key, bucket, n: sign * r.n, err: sign * r.err, sum: sign * r.sum, c, firstMs: adds ? r.f : null, lastMs: adds ? r.l : null, ...top, ids };
}

function sideDelta(s: StoredContributions | null, sign: 1 | -1, now: number, retentionMs: number, out: SettleDelta): void {
  for (const r of s?.rows ?? []) {
    for (const tier of TIERS) {
      if (!isKept(tier, r.b, now, retentionMs)) continue;
      const d = rowDelta(s!, r, tier, sign);
      out.rollup.push(d);
      for (const [bin, cnt] of Object.entries(r.h ?? {})) out.hist.push({ tier: d.tier, project: d.project, env: d.env, kind: d.kind, key: d.key, bucket: d.bucket, bin: Number(bin), cnt: sign * cnt });
    }
  }
}

/** New minus old on all three tiers, not yet summed: callers merge a whole batch with `mergeDeltas`. Buckets a tier no longer keeps are skipped. Tops and ids come only from `next`. */
export function settleDelta(old: StoredContributions | null, next: StoredContributions | null, now: number, retentionMs: number): SettleDelta {
  const out: SettleDelta = { rollup: [], hist: [] };
  sideDelta(old, -1, now, retentionMs, out);
  sideDelta(next, 1, now, retentionMs, out);
  return out;
}

const rowId = (d: Omit<HistDelta, "bin" | "cnt">) => `${d.tier}\u0000${d.project}\u0000${d.env}\u0000${d.kind}\u0000${d.key}\u0000${d.bucket}`;

const later = (a: number | null, b: number | null) => (b ?? -Infinity) > (a ?? -Infinity);

function mergeIds(a: RollupDelta, b: RollupDelta): string {
  const parts = later(a.lastMs, b.lastMs) ? [b.ids, a.ids] : [a.ids, b.ids];
  const ids = [...new Set(parts.join(" ").split(" ").filter(Boolean))];
  return ids.slice(0, KIND_SPEC[a.kind].ids).join(" ");
}

const idCount = (ids: string): number => (ids ? ids.split(" ").length : 0);

/** Add `b` into `a`, which the merge owns. Ids merge first, while the last times still say which side is newer. */
function addInto(a: RollupDelta, b: RollupDelta): void {
  if (b.ids && (later(a.lastMs, b.lastMs) || idCount(a.ids) < KIND_SPEC[a.kind].ids)) a.ids = mergeIds(a, b);
  a.n += b.n;
  a.err += b.err;
  a.sum += b.sum;
  for (let i = 0; i < a.c.length; i++) a.c[i]! += b.c[i] ?? 0;
  if (b.firstMs !== null) a.firstMs = a.firstMs === null ? b.firstMs : Math.min(a.firstMs, b.firstMs);
  if (b.lastMs !== null) a.lastMs = a.lastMs === null ? b.lastMs : Math.max(a.lastMs, b.lastMs);
  if ((b.topRank ?? -Infinity) > (a.topRank ?? -Infinity)) (a.top = b.top), (a.topRank = b.topRank);
}

const isEmpty = (d: RollupDelta) =>
  [d.n, d.err, d.sum, ...d.c].every((v) => Math.abs(v) < EPS) && d.firstMs === null && d.topRank === null && d.ids === "";

/** Sum the deltas of a whole batch per (tier, scope, kind, key, bucket), and drop changes that net to nothing. Inputs are not changed. */
export function mergeDeltas(parts: readonly SettleDelta[]): SettleDelta {
  const rollup = new Map<string, RollupDelta>();
  const hist = new Map<string, HistDelta>();
  for (const p of parts) {
    for (const d of p.rollup) {
      const id = rowId(d);
      const had = rollup.get(id);
      if (had) addInto(had, d);
      else rollup.set(id, { ...d, c: [...d.c] });
    }
    for (const h of p.hist) {
      const id = `${rowId(h)}\u0000${h.bin}`;
      const had = hist.get(id);
      if (had) had.cnt += h.cnt;
      else hist.set(id, { ...h });
    }
  }
  return { rollup: [...rollup.values()].filter((d) => !isEmpty(d)), hist: [...hist.values()].filter((h) => Math.abs(h.cnt) >= EPS) };
}
