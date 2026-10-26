import { describe, expect, it } from "vitest";
import { pageParams, PAGE_SIZES, slicePage } from "./input.js";
import { groupPage, pagedRows, sortParam } from "./paged.js";

const rows = Array.from({ length: 40 }, (_, i) => i + 1);

describe("paging", () => {
  it("reads one list's page and size, or a named list's", () => {
    expect(pageParams({}, 15)).toEqual({ page: 1, size: 15 });
    expect(pageParams({ page: "3", size: "30" }, 15)).toEqual({ page: 3, size: 30 });
    expect(pageParams({ page: "3", eppage: "2", epsize: "50" }, 15, "ep")).toEqual({ page: 2, size: 50 });
    expect(pageParams({ page: "-1", size: "x" }, 15)).toEqual({ page: 1, size: 15 });
  });

  it("slices one page, and shows the last page for a page past the end", () => {
    expect(slicePage(rows, 1, 15)).toEqual({ rows: rows.slice(0, 15), page: 1 });
    expect(slicePage(rows, 3, 15)).toEqual({ rows: rows.slice(30), page: 3 });
    expect(slicePage(rows, 9, 15)).toEqual({ rows: rows.slice(30), page: 3 });
    expect(slicePage(rows, 0, 15).page).toBe(1);
    expect(slicePage([], 4, 15)).toEqual({ rows: [], page: 1 });
  });

  it("starts the size choices at 15", () => {
    expect(PAGE_SIZES[0]).toBe(15);
  });

  it("reads a list's sort, high first with a minus", () => {
    expect(sortParam({ sort: "-avg" }, "", ["avg", "n"], null)).toEqual({ key: "avg", desc: true });
    expect(sortParam({ tblsort: "n" }, "tbl", ["avg", "n"], null)).toEqual({ key: "n", desc: false });
    expect(sortParam({ sort: "nope" }, "", ["avg"], { key: "avg", desc: true })).toEqual({ key: "avg", desc: true });
  });

  it("sorts every row, then pages, ties in the order given", () => {
    const items = rows.map((i) => ({ i, odd: i % 2 }));
    const out = pagedRows(items, { sort: "-odd", page: "2" }, "", 15, { odd: (r) => r.odd });
    expect(out.rows.map((r) => r.i)).toEqual([31, 33, 35, 37, 39, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(out.paging).toEqual({ key: "", total: 40, page: 2, size: 15, sort: { key: "odd", desc: true } });
  });

  it("orders one page of groups", () => {
    const g = groupPage({ tblpage: "3", tblsize: "10", tblsort: "avg" }, "tbl", 5, { queries: "n", avg: "avg" }, { key: "queries", desc: true });
    expect(g.order).toEqual({ by: "avg", desc: false, limit: 10, offset: 20 });
    expect(g.paging(42)).toEqual({ key: "tbl", total: 42, page: 3, size: 10, sort: { key: "avg", desc: false } });
  });
});
