// Server paging and sorting for lists a page model sends one page of.
import type { AggOrder } from "../scale/needs.js";
import { type ModelParams, pageParams, slicePage } from "./input.js";

/** A column to sort by, high first when `desc`. */
export interface SortSpec {
  key: string;
  desc: boolean;
}

/** Where one page of a list sits: its URL key, every matching row, the page, and the sort. */
export interface PageInfo {
  /** URL key: "" reads page, size, and sort; "tbl" reads tblpage, tblsize, and tblsort. */
  key: string;
  total: number;
  page: number;
  size: number;
  sort: SortSpec | null;
}

/** A list's sort from the URL: `<key>sort` is a column name, "-" in front for high first. */
export function sortParam(p: ModelParams, key: string, columns: readonly string[], fallback: SortSpec | null): SortSpec | null {
  const raw = p[`${key}sort`]?.trim() ?? "";
  const desc = raw.startsWith("-");
  const name = desc ? raw.slice(1) : raw;
  return columns.includes(name) ? { key: name, desc } : fallback;
}

export type SortValue<T> = (row: T) => number | string;

/** Impact as a number to sort by. */
export const IMPACT_RANK = { high: 3, medium: 2, low: 1 } as const;

/** How many insight or security groups a page shows at first. */
export const GROUP_PAGE_SIZE = 15;

/** Sorts by `sort`, ties in the order given. */
function sortRows<T>(rows: readonly T[], sort: SortSpec | null, values: Record<string, SortValue<T>>): readonly T[] {
  const get = sort && values[sort.key];
  if (!sort || !get) return rows;
  const dir = sort.desc ? -1 : 1;
  return rows.map((row, i) => ({ row, i, v: get(row) })).sort((a, b) => (a.v < b.v ? -dir : a.v > b.v ? dir : a.i - b.i)).map((x) => x.row);
}

/** One sorted page of a list the model built whole. `values` names the columns it can sort by. */
export function pagedRows<T>(rows: readonly T[], p: ModelParams, key: string, defaultSize: number, values: Record<string, SortValue<T>> = {}, fallback: SortSpec | null = null): { rows: T[]; paging: PageInfo } {
  const sort = sortParam(p, key, Object.keys(values), fallback);
  const { page, size } = pageParams(p, defaultSize, key);
  const shown = slicePage(sortRows(rows, sort, values), page, size);
  return { rows: shown.rows, paging: { key, total: rows.length, page: shown.page, size, sort } };
}

/** The order of one page of rollup groups, and where it sits. `orders` maps column names to group orders. */
export function groupPage(p: ModelParams, key: string, defaultSize: number, orders: Record<string, AggOrder>, fallback: SortSpec): { order: { by: AggOrder; desc: boolean; limit: number; offset: number }; paging: (total: number) => PageInfo } {
  const sort = sortParam(p, key, Object.keys(orders), fallback) ?? fallback;
  const { page, size } = pageParams(p, defaultSize, key);
  const order = { by: orders[sort.key] ?? "n", desc: sort.desc, limit: size, offset: (page - 1) * size };
  return { order, paging: (total) => ({ key, total, page, size, sort }) };
}
