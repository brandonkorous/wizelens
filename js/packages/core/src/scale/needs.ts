// What a page asks for (needs), what an executor answers (results), and how a page is defined.
import type { ModelParams } from "../models/input.js";
import type { TimeRange, TimeWindow } from "../stats/common.js";
import type { LogLevel, Trace } from "../types.js";
import { type Agg, avgOfAgg } from "./agg.js";
import { type RollupKind, splitKey } from "./kinds.js";

export type WindowRef = "cur" | "prev";
/** Bucket counts the pages use for series. */
export type BucketCount = 16 | 24 | 48;

/** Which keys of a kind to read. All given conditions must hold. */
export interface KeyFilter {
  prefix?: string;
  keys?: readonly string[];
  /** Key parts to match, in order; null matches any value. */
  parts?: readonly (string | null)[];
}

export type AggOrder = "n" | "sum" | "avg" | "lastMs" | "c0" | "c1" | "c2" | "c3" | "c4" | "c5";

/** Rollup groups of one kind over a window: one row per key. */
export interface GroupNeed {
  type: "groups";
  id: string;
  kind: RollupKind;
  window: WindowRef;
  filter?: KeyFilter;
  hist?: boolean;
  top?: boolean;
  ids?: boolean;
  /** Sort by this (ties by key) and keep the first `limit` rows. `total` still counts all rows. */
  order?: { by: AggOrder; desc: boolean; limit: number };
}

/** A kind per page bucket: summed over keys, or per key with `split`. */
export interface SeriesNeed {
  type: "series";
  id: string;
  kind: RollupKind;
  window: WindowRef;
  buckets: BucketCount;
  filter?: KeyFilter;
  split?: boolean;
  hist?: boolean;
}

export type ListTable = "requests" | "traces" | "logs" | "critical";

/** Filters for list tables. Request filters match `applyFilter`; log filters match `filterLogs`. */
export interface ListFilter {
  traceId?: string;
  method?: string;
  status?: string;
  duration?: string;
  service?: string;
  q?: string;
  minLevel?: LogLevel;
  logService?: string;
}

/** Rows of a fact table in a window: filtered, sorted, then paged or limited. */
export interface ListNeed {
  type: "list";
  id: string;
  table: ListTable;
  window: WindowRef;
  filter: ListFilter;
  /** Requests: a request SortKey; traces and logs: "time"; critical: "duration". */
  sort: { key: string; desc: boolean };
  /** Page numbers start at 1 and are clamped to the last page, like `pageOf`. */
  page?: { page: number; size: number };
  limit?: number;
  count?: boolean;
  /** Requests only: totals and per-bucket aggregates of the filtered rows, like a "req" rollup. */
  aggregate?: { buckets: BucketCount };
}

/** One whole trace: by id when it started in one of the windows; else (no id, or not found) the newest in cur. */
export interface TraceNeed {
  type: "trace";
  id: string;
  traceId: string | null;
  windows: readonly WindowRef[];
}

export type Need = GroupNeed | SeriesNeed | ListNeed | TraceNeed;

export interface GroupRows {
  rows: { key: string; agg: Agg }[];
  /** Groups before the limit. */
  total: number;
}

/** Aggs per page bucket. The key is "" when not split. */
export interface SeriesRows {
  byKey: Record<string, Agg[]>;
}

export interface ListRows<T = unknown> {
  items: T[];
  /** Matching rows before paging; null unless counted or paged. */
  total: number | null;
  page: number;
  pageSize: number;
  aggregate?: { total: Agg; series: Agg[] };
}

/** Everything a page model needs besides data: the windows, the URL params, and the options. */
export interface PageContext {
  range: TimeRange;
  window: TimeWindow;
  prev: TimeWindow;
  now: number;
  params: ModelParams;
  options: { slowQueryMs: number };
  /** Traces still waiting for their stats, when the host knows; null or absent when none. */
  settling?: number | null;
}

export interface NeedResults {
  groups: Record<string, GroupRows>;
  series: Record<string, SeriesRows>;
  lists: Record<string, ListRows>;
  traces: Record<string, Trace | null>;
}

export type PageData = PageContext & NeedResults;

/** A page: what it needs from its params, optional second-phase needs, and its model from the results. */
export interface PageDef<M> {
  needs(ctx: PageContext): Need[];
  followUp?(ctx: PageContext, first: NeedResults): Need[];
  model(d: PageData): M;
}

/** Runs needs against a database. */
export interface Executor {
  run(needs: readonly Need[], ctx: PageContext): Promise<NeedResults>;
}

/** Runs needs in memory, for the browser and tests. */
export interface SyncExecutor {
  runSync(needs: readonly Need[], ctx: PageContext): NeedResults;
}

export const emptyResults = (): NeedResults => ({ groups: {}, series: {}, lists: {}, traces: {} });

/** The window a need refers to. */
export const windowOfRef = (ctx: Pick<PageContext, "window" | "prev">, ref: WindowRef): TimeWindow => (ref === "cur" ? ctx.window : ctx.prev);

/** True when a rollup key passes the filter: prefix, key list, and key parts (null matches any part). */
export function keyMatches(key: string, f: KeyFilter | undefined): boolean {
  if (!f) return true;
  if (f.prefix !== undefined && !key.startsWith(f.prefix)) return false;
  if (f.keys && !f.keys.includes(key)) return false;
  if (!f.parts) return true;
  const parts = splitKey(key);
  return parts.length === f.parts.length && f.parts.every((p, i) => p === null || p === parts[i]);
}

/** The value a group order sorts by. Avg is null for empty rows, which sort last. */
export function orderValue(a: Agg, by: AggOrder): number {
  if (by === "avg") return avgOfAgg(a) ?? -Infinity;
  if (by === "n" || by === "sum" || by === "lastMs") return a[by];
  return a.c[Number(by.slice(1))] ?? 0;
}

/** Sort group rows by an order, ties by key ascending, as the SQL executor does. */
export function sortGroups<R extends { key: string; agg: Agg }>(rows: readonly R[], by: AggOrder, desc: boolean): R[] {
  const dir = desc ? -1 : 1;
  return [...rows].sort((x, y) => (orderValue(x.agg, by) - orderValue(y.agg, by)) * dir || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
}
