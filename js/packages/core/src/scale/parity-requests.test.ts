import { describe, expect, it } from "vitest";
import { inWindow, type TimeRange } from "../stats/common.js";
import { requestRows } from "../stats/requests.js";
import { differences, newModel, PARITY_RANGES, parityOf } from "../testing/parity.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { pageContext } from "./run.js";

const SORT_KEYS = ["time", "path", "method", "status", "duration", "sql", "fetch", "service", "insights"];
const FILTERS: Record<string, string>[] = [
  { method: "GET" },
  { method: "POST" },
  { method: "gRPC" },
  { status: "2xx" },
  { status: "4xx" },
  { status: "5xx" },
  { status: "failed" },
  { duration: "fast" },
  { duration: "medium" },
  { duration: "slow" },
  { duration: "slowest" },
  { service: "api" },
  { service: "orders" },
  { service: "browser" },
  { service: "gateway", status: "2xx" },
  { method: "POST", status: "failed", duration: "medium" },
  { q: "orders" },
  { q: "user-9" },
  { q: "beta" },
  { q: "orders", status: "failed" },
  { q: "  " },
  { duration: "bogus" },
  { status: "bogus" },
];

const curRequests = (range: TimeRange) => requestRows(scenarioTraces().filter((t) => inWindow(t.startMs, pageContext(range, SCENARIO_NOW, {}).window)));

describe("parity: requests", () => {
  it("matches with every filter", () => {
    for (const range of PARITY_RANGES) for (const f of [{}, ...FILTERS]) expect(parityOf("requests", range, f)).toEqual([]);
  });

  it("matches with every sort key, both ways, and on page 2", () => {
    for (const range of PARITY_RANGES) {
      for (const sort of SORT_KEYS) {
        for (const desc of ["1", "0"]) expect(parityOf("requests", range, { sort, desc, size: "5", page: "2" })).toEqual([]);
      }
      expect(parityOf("requests", range, { sort: "nope", page: "999" })).toEqual([]);
    }
  });

  it("matches a selected request, inside and outside the range", () => {
    for (const range of PARITY_RANGES) {
      const rows = curRequests(range);
      expect(rows.length).toBeGreaterThan(0);
      for (const trace of [rows[0]!.traceId, rows[rows.length - 1]!.traceId, "f".repeat(32)]) expect(parityOf("requests", range, { trace, status: "5xx" })).toEqual([]);
    }
  });

  it("the comparison sees a changed number", () => {
    const m = newModel("requests", "24h");
    expect(differences({ ...m, total: m.total + 1 }, m)).toHaveLength(1);
    expect(m.total).toBeGreaterThan(5);
  });
});
