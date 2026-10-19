// What a page asks for (needs), what an executor answers (results), and how a page is defined.
import type { ModelParams } from "../models/input.js";
import type { TimeRange, TimeWindow } from "../stats/common.js";
import type { IssueStates } from "../issues.js";
import type { Compare } from "../stats/period.js";
import type { LogLevel, Trace } from "../types.js";
import { type Agg, avgOfAgg } from "./agg.js";
import { type RollupKind, splitKey } from "./kinds.js";

/** The page's window (cur), the one before it (prev), all kept data (all), the week before cur (before), cur moved back whole days or weeks, or a fixed span. */
export type WindowRef = "cur" | "prev" | "all" | "before" | `cur-${number}d` | `cur-${number}w` | TimeWindow;
/** Buckets in a series: most pages use 16, 24, or 48; Problems uses a fixed grid, so its count varies. */
export type BucketCount = number;

/** Which keys of a kind to read. All given conditions must hold. */
export interface KeyFilter {
  prefix?: string;
  keys?: readonly string[];
  /** Key parts to match, in order; null matches any value. */
  parts?: readonly (string | null)[];
  /** Text the key must hold, each one, ignoring ASCII case. */
  contains?: readonly string[];
  /** Keys to leave out. */
  exclude?: readonly string[];
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
  /** Sort by this (ties by key), skip `offset` rows, and keep `limit`. `total` still counts all rows. */
  order?: { by: AggOrder; desc: boolean; limit: number; offset?: number };
  /** Only rows whose value (as an order reads it) is at least `min`, for example critical groups (`c0` at least 1). */
  having?: { by: AggOrder; min: number };
  /** Only this service's items (display name), from the kind's per-service copy; keys come back without it. */
  service?: string;
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
  /** Only this service's items, as on `GroupNeed`. */
  service?: string;
}

export type ListTable = "requests" | "traces" | "logs" | "critical";

/** Filters for list tables. Request filters match `applyFilter`; log filters match `filterLogs`. */
export interface ListFilter {
  traceId?: string;
  /** Only these traces, for example an error's newest occurrences. */
  traceIds?: readonly string[];
  method?: string;
  status?: string;
  duration?: string;
  service?: string;
  q?: string;
  /** Requests: the exact endpoint, the user, and only those with insights. */
  endpoint?: string;
  user?: string;
  insights?: boolean;
  minLevel?: LogLevel;
  /** Logs: only `minLevel`, not it and up. */
  exactLevel?: boolean;
  logService?: string;
  /** Logs: only this category. */
  category?: string;
  /** Logs: only lines of this pattern id (`patternIdOf`). */
  pattern?: string;
  /** Logs: only lines written in a request, or only lines outside one. */
  logOrigin?: "request" | "outside";
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
  /** Requests and logs: totals and per-bucket aggregates of the filtered rows, like a "req" or "log" rollup (logs: err is lines at error and up). */
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
  /** True when the window is a custom from–to; `range` is then the smallest preset that covers it. */
  custom?: boolean;
  /** What `prev` is: the window right before, or the same window a week earlier. */
  compare?: Compare;
  /** Issue states (resolved, ignored, assigned) on hosts that keep them; absent elsewhere. */
  issues?: IssueStates;
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

const DAY_MS = 86_400_000;
const SHIFT = /^cur-(\d+)([dw])$/;

/** The window a need refers to. */
export function windowOfRef(ctx: Pick<PageContext, "window" | "prev" | "now">, ref: WindowRef): TimeWindow {
  if (typeof ref === "object") return ref;
  if (ref === "cur") return ctx.window;
  if (ref === "prev") return ctx.prev;
  if (ref === "all") return { from: 0, to: ctx.now };
  if (ref === "before") return { from: ctx.window.from - 7 * DAY_MS, to: ctx.window.from };
  const m = SHIFT.exec(ref);
  const back = m ? Number(m[1]) * (m[2] === "w" ? 7 : 1) * DAY_MS : 0;
  return { from: ctx.window.from - back, to: ctx.window.to - back };
}

/** Lower case for ASCII letters only, the way every SQL engine's lower() agrees. */
export const lowerAscii = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** True when a rollup key passes the filter: prefix, key list, text, and key parts (null matches any part). */
export function keyMatches(key: string, f: KeyFilter | undefined): boolean {
  if (!f) return true;
  if (f.contains?.some((t) => !lowerAscii(key).includes(lowerAscii(t)))) return false;
  if (f.exclude?.includes(key)) return false;
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
