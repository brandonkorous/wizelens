import { describe, expect, it } from "vitest";
import { makeRequest } from "../testing/fixtures.js";
import { requestActivity, requestHeadlines, timingBreakdown } from "./overview.js";
import { requestRows } from "./requests.js";

const w = { from: 0, to: 4000 };
const prevW = { from: -4000, to: 0 };

describe("overview stats", () => {
  it("builds headlines and compares with the previous window", () => {
    const rows = requestRows([
      makeRequest({ startMs: 100, serverMs: 100, queries: [{ sql: "SELECT 1", ms: 5 }] }),
      makeRequest({ startMs: 2100, serverMs: 300, status: 500, error: { type: "Boom", message: "bad" } }),
    ]);
    const prev = requestRows([makeRequest({ startMs: -1000, serverMs: 100 })]);
    const h = requestHeadlines(rows, prev, w, 4);
    expect(h.total).toMatchObject({ value: 2, previous: 1, change: 100 });
    expect(h.total.series).toEqual([1, 0, 1, 0]);
    expect(h.avgDuration.value).toBe(200);
    expect(h.sqlQueries.value).toBe(1);
    expect(h.errorRate).toMatchObject({ value: 50, previous: 0, change: null });
    expect(h.errorRate.series).toEqual([0, null, 100, null]);
    expect(requestHeadlines(rows, [], prevW, 4).total.change).toBeNull();
  });

  it("builds activity and timing breakdown", () => {
    const rows = requestRows([
      makeRequest({ startMs: 100, serverMs: 80, fetchMs: 100, renderMs: 20, queries: [{ sql: "SELECT 1", ms: 10 }] }),
      makeRequest({ startMs: 3000, serverMs: 40, status: 503 }),
    ]);
    const a = requestActivity(rows, w, 4);
    expect(a.starts).toEqual([0, 1000, 2000, 3000]);
    expect(a.requests).toEqual([1, 0, 0, 1]);
    expect(a.errors).toEqual([0, 0, 0, 1]);
    expect(timingBreakdown(rows)).toEqual({ request: 80, server: 60, database: 5, render: 20, network: 20 });
    expect(timingBreakdown([])).toEqual({ request: null, server: null, database: null, render: null, network: null });
  });
});
