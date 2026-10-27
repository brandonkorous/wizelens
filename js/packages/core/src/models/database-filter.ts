// The Database page filter: which query shapes the list shows, in what order, one page at a time.
import { splitKey } from "../scale/kinds.js";
import type { AggOrder, GroupNeed } from "../scale/needs.js";
import { type ModelParams, pageParams, scoped, serviceParam } from "./input.js";
import { groupNeed } from "./read.js";

export type QuerySort = "avg" | "count" | "total";

export interface QueryFilter {
  /** The service that ran the queries (display name); "" for all. */
  service: string;
  /** Text in the query. */
  q: string;
  /** A table name the query mentions. */
  table: string;
  /** SELECT, INSERT, UPDATE, DELETE, or OTHER. */
  operation: string;
  /** A database as the Services page names it, for example "postgresql · shop". */
  database: string;
  sort: QuerySort;
}

export const QUERY_PAGE_SIZE = 15;

const SORT_BY: Record<QuerySort, AggOrder> = { avg: "avg", count: "n", total: "sum" };
const isSort = (v: string | undefined): v is QuerySort => !!v && Object.hasOwn(SORT_BY, v);

/** The filter from URL parameters: service, q, table, operation, database, sort (avg, count, total). */
export const queryFilterOf = (p: ModelParams): QueryFilter => ({
  service: serviceParam(p) ?? "",
  q: p.q?.trim() ?? "",
  table: p.table?.trim() ?? "",
  operation: p.operation?.trim().toUpperCase() ?? "",
  database: p.database?.trim() ?? "",
  sort: isSort(p.sort) ? p.sort : "avg",
});

/** True when the list reads `db.qd` (keyed by operation, database, and query). */
const byDatabase = (f: QueryFilter) => !!(f.operation || f.database);

/** One page of matching query shapes. */
export function queryListNeed(f: QueryFilter, p: ModelParams): GroupNeed {
  const { page, size } = pageParams(p, QUERY_PAGE_SIZE);
  const contains = [f.q, f.table].filter(Boolean);
  const filter = { ...(byDatabase(f) ? { parts: [f.operation || null, f.database || null, null] } : {}), ...(contains.length ? { contains } : {}) };
  const order = { by: SORT_BY[f.sort], desc: true, limit: size, offset: (page - 1) * size };
  return groupNeed("db.q", byDatabase(f) ? "db.qd" : "db.q", "cur", { top: true, hist: true, filter, order, ...scoped(f.service || undefined) });
}

/** The query text of a `db.q` or `db.qd` key. */
export const queryOfKey = (key: string): string => splitKey(key).at(-1)!;
