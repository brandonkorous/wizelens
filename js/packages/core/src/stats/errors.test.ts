import { describe, expect, it } from "vitest";
import { makeRequest } from "../testing/fixtures.js";
import { messageShape } from "./error-keys.js";
import { errorEvents, errorGroups, errorRateOf, errorsByService, errorTypeCounts } from "./errors.js";
import { filterLogs, levelCounts, logRows } from "./logs.js";
import { requestRows } from "./requests.js";

const boom = (startMs: number, id: number) =>
  makeRequest({ startMs, route: "/api/orders/{id}", path: `/api/orders/${id}`, status: 500, error: { type: "TypeError", message: `Cannot read order ${id}` } });

describe("error stats", () => {
  const traces = [boom(1000, 7), boom(2000, 9), makeRequest({ startMs: 3000 })];
  const events = errorEvents(traces);

  it("finds exceptions and groups them by message shape", () => {
    expect(messageShape("order 42 for 1f2e3d4c-0000-4000-8000-123456789abc")).toBe("order # for {id}");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "TypeError", service: "api", endpoint: "GET /api/orders/{id}", status: 500, critical: true });
    const [group] = errorGroups(events);
    expect(group).toMatchObject({ count: 2, critical: true, type: "TypeError", firstSeenMs: events[1]!.timeMs, lastSeenMs: events[0]!.timeMs });
    expect(errorTypeCounts(events)).toEqual([{ type: "TypeError", count: 2 }]);
  });

  it("computes error rates per service", () => {
    const rows = requestRows(traces);
    expect(errorRateOf(rows)).toBeCloseTo(66.67, 1);
    expect(errorsByService(events, rows)).toEqual([{ service: "api", exceptions: 2, requests: 3, errorRate: expect.closeTo(66.67, 1) }]);
  });

  it("counts every browser fetch for the web app, not only the ones that failed", () => {
    const fetched = [1, 2, 3].map((i) => makeRequest({ startMs: 5000 + i, fetchMs: 20 }));
    const rows = requestRows([...fetched, boom(9000, 1)]);
    const web = errorsByService(errorEvents(fetched), rows).find((s) => s.service === "Web App");
    expect(web).toMatchObject({ requests: 3, errorRate: 0 });
  });
});

describe("log stats", () => {
  const t = makeRequest({
    logs: [
      { timeMs: 10, level: "info", category: "orders", message: "found 3 orders", attributes: {} },
      { timeMs: 20, level: "error", category: "orders", message: "db timeout", attributes: {} },
    ],
  });

  it("lists, filters, and counts log lines", () => {
    const rows = logRows([t]);
    expect(rows.map((r) => r.message)).toEqual(["db timeout", "found 3 orders"]);
    expect(filterLogs(rows, { minLevel: "warn", service: "", query: "" })).toHaveLength(1);
    expect(filterLogs(rows, { minLevel: "trace", service: "api", query: "FOUND" })).toHaveLength(1);
    expect(levelCounts(rows)).toMatchObject({ info: 1, error: 1, warn: 0 });
  });
});
