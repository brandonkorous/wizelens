import { describe, expect, it } from "vitest";
import { pageParams, PAGE_SIZES, slicePage } from "./input.js";

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
});
