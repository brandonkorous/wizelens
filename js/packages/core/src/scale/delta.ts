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

/** New minus old on all three tiers. Buckets a tier no longer keeps are skipped. Tops and ids come only from `next`. */
export function settleDelta(old: StoredContributions | null, next: StoredContributions | null, now: number, retentionMs: number): SettleDelta {
  const out: SettleDelta = { rollup: [], hist: [] };
  sideDelta(old, -1, now, retentionMs, out);
  sideDelta(next, 1, now, retentionMs, out);
  return mergeDeltas([out]);
}

const rowId = (d: Omit<HistDelta, "bin" | "cnt">) => `${d.tier}\u0000${d.project}\u0000${d.env}\u0000${d.kind}\u0000${d.key}\u0000${d.bucket}`;

const later = (a: number | null, b: number | null) => (b ?? -Infinity) > (a ?? -Infinity);

function mergeIds(a: RollupDelta, b: RollupDelta): string {
  const parts = later(a.lastMs, b.lastMs) ? [b.ids, a.ids] : [a.ids, b.ids];
  const ids = [...new Set(parts.join(" ").split(" ").filter(Boolean))];
  return ids.slice(0, KIND_SPEC[a.kind].ids).join(" ");
}

function mergeRow(a: RollupDelta, b: RollupDelta): RollupDelta {
  const pick = <T>(x: T | null, y: T | null, f: (p: T, q: T) => T) => (x === null ? y : y === null ? x : f(x, y));
  const top = (b.topRank ?? -Infinity) > (a.topRank ?? -Infinity) ? { top: b.top, topRank: b.topRank } : { top: a.top, topRank: a.topRank };
  return {
    ...a,
    n: a.n + b.n,
    err: a.err + b.err,
    sum: a.sum + b.sum,
    c: a.c.map((v, i) => v + (b.c[i] ?? 0)),
    firstMs: pick(a.firstMs, b.firstMs, Math.min),
    lastMs: pick(a.lastMs, b.lastMs, Math.max),
    ...top,
    ids: mergeIds(a, b),
  };
}

const isEmpty = (d: RollupDelta) =>
  [d.n, d.err, d.sum, ...d.c].every((v) => Math.abs(v) < EPS) && d.firstMs === null && d.topRank === null && d.ids === "";

/** Sum the deltas of a whole batch per (tier, scope, kind, key, bucket), and drop changes that net to nothing. */
export function mergeDeltas(parts: readonly SettleDelta[]): SettleDelta {
  const rollup = new Map<string, RollupDelta>();
  const hist = new Map<string, HistDelta>();
  for (const p of parts) {
    for (const d of p.rollup) {
      const id = rowId(d);
      const had = rollup.get(id);
      rollup.set(id, had ? mergeRow(had, d) : d);
    }
    for (const h of p.hist) {
      const id = `${rowId(h)}\u0000${h.bin}`;
      const had = hist.get(id);
      hist.set(id, had ? { ...had, cnt: had.cnt + h.cnt } : h);
    }
  }
  return { rollup: [...rollup.values()].filter((d) => !isEmpty(d)), hist: [...hist.values()].filter((h) => Math.abs(h.cnt) >= EPS) };
}
