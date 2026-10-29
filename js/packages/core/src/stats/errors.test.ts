import { describe, expect, it } from "vitest";
import { makeRequest } from "../testing/fixtures.js";
import { messageShape } from "./error-keys.js";
import { errorEvents, errorGroupLabel, errorGroups, errorRateOf, errorsByService, errorText, errorTypeCounts, isNoise } from "./errors.js";
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

  it("names a failed 500 with no exception and no reason by its status, as ASP.NET leaves it", () => {
    const t = makeRequest({ startMs: 4000, status: 500 });
    Object.assign(t.spans[0]!, { status: "error", statusMessage: null });
    expect(errorEvents([t])[0]).toMatchObject({ type: "HttpError", message: "HTTP 500", status: 500 });
  });

  it("never counts a dev server rebuilding as critical, so no alert fires for it", () => {
    const t = makeRequest({ startMs: 4500, status: 500, error: { type: "Error", message: "ENOENT: no such file or directory, open '/app/.next/routes-manifest.json'" } });
    expect(errorEvents([t])[0]).toMatchObject({ status: 500, critical: false });
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

describe("errorGroupLabel", () => {
  const group = (message: string, over = {}) => ({ message, bots: 0, count: 3, critical: true, ...over });

  it("names a dev server's own build files Dev server, in grey, even on a failed page", () => {
    const enoent = group("ENOENT: no such file or directory, open 'C:\\kanninja\\apps\\web\\.next\\routes-manifest.json'");
    expect([errorGroupLabel(enoent), isNoise(enoent)]).toEqual(["Dev server", true]);
    expect(errorGroupLabel(group("Jest worker encountered 2 child process exceptions, exceeding retry limit"))).toBe("Dev server");
  });

  it("says an error's type once when its message already starts with it", () => {
    expect(errorText({ type: "ENOENT", message: "ENOENT: no such file or directory" })).toBe("ENOENT: no such file or directory");
    expect(errorText({ type: "HttpError", message: "HTTP 503" })).toBe("HttpError: HTTP 503");
    expect(errorText({ type: "", message: "Validation failed" })).toBe("Validation failed");
  });

  it("keeps the app's own errors critical or plain, and bots bot-only", () => {
    expect(errorGroupLabel(group("Validation failed: Waiting on client"))).toBe("Critical");
    expect(errorGroupLabel(group("Card not found", { critical: false }))).toBe("Error");
    expect(errorGroupLabel(group("/wp-login.php not found", { critical: false, bots: 3 }))).toBe("Bot-only");
    expect(isNoise(group("ENOENT: no such file or directory, open '/srv/uploads/next/logo.png'"))).toBe(false);
  });
});
