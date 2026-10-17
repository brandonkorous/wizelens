// Storage form of a trace's contributions: merged per kind, key, and 10 s bucket, kept on the trace row.
import { addHist, type Hist, histOf } from "./hist.js";
import { FACTS_VERSION, type TraceFacts } from "./facts.js";
import { KIND_SPEC, type RollupKind } from "./kinds.js";

/** The finest rollup bucket: stored contributions and the 10 s tier use it. */
export const BASE_BUCKET_MS = 10_000;

export interface StoredContribution {
  k: RollupKind;
  key: string;
  /** Start of the 10 s bucket. */
  b: number;
  n: number;
  err: number;
  sum: number;
  /** Counters; absent when all zero. */
  c?: number[];
  /** Histogram; only for kinds that keep one. */
  h?: Hist;
  /** Earliest and latest item time. */
  f: number;
  l: number;
  /** Top data and rank; `withoutTop` drops them for storage, since only new contributions set tops. */
  t?: unknown;
  r?: number;
}

export interface StoredContributions {
  v: number;
  traceId: string;
  project: string;
  env: string;
  rows: StoredContribution[];
}

export interface Scope {
  project: string;
  env: string;
}

const bucketOf = (timeMs: number) => Math.floor(timeMs / BASE_BUCKET_MS) * BASE_BUCKET_MS;

/** A trace's contributions merged per (kind, key, 10 s bucket), for one scope. */
export function compact(f: TraceFacts, scope: Scope): StoredContributions {
  const rows = new Map<string, StoredContribution>();
  for (const c of f.contributions) {
    const b = bucketOf(c.timeMs);
    const id = `${c.kind}\u0000${c.key}\u0000${b}`;
    const row = rows.get(id) ?? { k: c.kind, key: c.key, b, n: 0, err: 0, sum: 0, f: c.timeMs, l: c.timeMs };
    row.n += c.n;
    row.err += c.err;
    row.sum += c.sum;
    if (c.c?.some((v) => v !== 0)) {
      const into = (row.c ??= []);
      c.c.forEach((v, i) => (into[i] = (into[i] ?? 0) + v));
    }
    if (KIND_SPEC[c.kind].hist && c.values?.length) addHist((row.h ??= {}), histOf(c.values));
    row.f = Math.min(row.f, c.timeMs);
    row.l = Math.max(row.l, c.timeMs);
    if (c.top && (row.r === undefined || c.top.rank > row.r)) Object.assign(row, { t: c.top.data, r: c.top.rank });
    rows.set(id, row);
  }
  return { v: FACTS_VERSION, traceId: f.traceId, project: scope.project, env: scope.env, rows: [...rows.values()] };
}

/** The same contributions without top data, which is all a host needs to keep to subtract them later. */
export function withoutTop(s: StoredContributions): StoredContributions {
  return { ...s, rows: s.rows.map(({ t: _t, r: _r, ...row }) => row) };
}
