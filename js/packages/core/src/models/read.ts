// Helpers for page definitions: build needs, and read the executor's answers.
import { type Agg, avgOfAgg, emptyAgg } from "../scale/agg.js";
import { addHist } from "../scale/hist.js";
import type { RollupKind } from "../scale/kinds.js";
import type { BucketCount, GroupNeed, ListNeed, ListRows, Need, NeedResults, SeriesNeed, WindowRef } from "../scale/needs.js";

export type Series = (number | null)[];
export type Row = { key: string; agg: Agg };

export const groupNeed = (id: string, kind: RollupKind, window: WindowRef, more: Partial<Omit<GroupNeed, "type">> = {}): GroupNeed => ({ type: "groups", id, kind, window, ...more });

export const seriesNeed = (id: string, kind: RollupKind, window: WindowRef, buckets: BucketCount, more: Partial<Omit<SeriesNeed, "type">> = {}): SeriesNeed => ({
  type: "series",
  id,
  kind,
  window,
  buckets,
  ...more,
});

export const listNeed = (id: string, table: ListNeed["table"], window: WindowRef, more: Partial<Omit<ListNeed, "type">> = {}): ListNeed => ({
  type: "list",
  id,
  table,
  window,
  filter: {},
  sort: { key: "time", desc: true },
  ...more,
});

/** Needs without repeats: the first need with an id wins. */
export function uniqueNeeds(needs: readonly Need[]): Need[] {
  const seen = new Set<string>();
  return needs.filter((n) => !seen.has(`${n.type}:${n.id}`) && !!seen.add(`${n.type}:${n.id}`));
}

export const rowsOf = (d: NeedResults, id: string): Row[] => d.groups[id]?.rows ?? [];

/** Groups before their limit. */
export const groupCount = (d: NeedResults, id: string): number => d.groups[id]?.total ?? 0;

/** Several aggregates added up: counts, sums, counters, histograms, and the time span. */
export function sumAggs(aggs: readonly Agg[]): Agg {
  const out = emptyAgg();
  for (const a of aggs) {
    out.n += a.n;
    out.err += a.err;
    out.sum += a.sum;
    a.c.forEach((v, i) => (out.c[i] = (out.c[i] ?? 0) + v));
    if (a.hist) addHist((out.hist ??= {}), a.hist);
    out.firstMs = Math.min(out.firstMs, a.firstMs);
    out.lastMs = Math.max(out.lastMs, a.lastMs);
  }
  return out;
}

/** All rows of a group need added up. */
export const totalOf = (d: NeedResults, id: string): Agg => sumAggs(rowsOf(d, id).map((r) => r.agg));

export const aggByKey = (d: NeedResults, id: string): Map<string, Agg> => new Map(rowsOf(d, id).map((r) => [r.key, r.agg]));

/** One key's buckets of a series need; empty buckets when the key has none. */
export function seriesOf(d: NeedResults, id: string, buckets: number, key = ""): Agg[] {
  return d.series[id]?.byKey[key] ?? Array.from({ length: buckets }, () => emptyAgg());
}

/** Several keys' buckets of a split series, added up per bucket. */
export function sumSeries(d: NeedResults, id: string, buckets: number, keys: readonly string[]): Agg[] {
  const lists = keys.map((k) => seriesOf(d, id, buckets, k));
  return Array.from({ length: buckets }, (_, i) => sumAggs(lists.map((l) => l[i]!)));
}

export const counts = (s: readonly Agg[]): Series => s.map((a) => a.n);
export const avgs = (s: readonly Agg[]): Series => s.map(avgOfAgg);
export const counter = (s: readonly Agg[], slot: number): Series => s.map((a) => a.c[slot] ?? 0);

export const listOf = <T>(d: NeedResults, id: string): ListRows<T> => (d.lists[id] ?? { items: [], total: 0, page: 1, pageSize: 0 }) as ListRows<T>;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Rows by a number, high first; ties by the newest item, then by key. */
export const byDesc = (value: (r: Row) => number) => (a: Row, b: Row) => value(b) - value(a) || b.agg.lastMs - a.agg.lastMs || cmp(a.key, b.key);
