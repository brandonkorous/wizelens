import { describe, expect, it } from "vitest";
import { makeRequest, makeSpan } from "../testing/fixtures.js";
import { buildTrace } from "../trace.js";
import { bucketIndex, normalizeQuery, percentChange, percentileOf, previousWindow, series } from "./common.js";
import { requestOf, requestRows, requestUserName } from "./requests.js";

describe("common stats", () => {
  it("buckets times and builds series", () => {
    const w = { from: 0, to: 100 };
    expect(bucketIndex(0, w, 4)).toBe(0);
    expect(bucketIndex(99, w, 4)).toBe(3);
    expect(bucketIndex(100, w, 4)).toBe(-1);
    expect(series([5, 30, 31, 80], (t) => t, w, 4)).toEqual([1, 2, 0, 1]);
    expect(series([5, 30], (t) => t, w, 4, "avg", (t) => t)).toEqual([5, 30, null, null]);
    expect(previousWindow(w)).toEqual({ from: -100, to: 0 });
  });

  it("computes percentiles, change, and query shapes", () => {
    expect(percentileOf([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentileOf([], 95)).toBeNull();
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(5, 0)).toBeNull();
    expect(normalizeQuery("SELECT * FROM t WHERE id = 42 AND name = 'O''Neil'")).toBe("SELECT * FROM t WHERE id = ? AND name = ?");
  });
});

describe("request rows", () => {
  it("builds a row from a request trace", () => {
    const t = makeRequest({ path: "/api/orders/7", route: "/api/orders/{id}", serverMs: 80, queries: [{ sql: "SELECT 1", ms: 10 }], fetchMs: 100, renderMs: 20, attributes: { "wizelens.tag.cache": "hit", "wizelens.tag.catalog": "", "enduser.id": "ada" } });
    const row = requestOf(t)!;
    expect(row).toMatchObject({ method: "GET", path: "/api/orders/7", endpoint: "GET /api/orders/{id}", status: 200, durationMs: 120, serverMs: 80, dbMs: 10, dbCount: 1, renderMs: 20, networkMs: 20, user: "ada", service: "api" });
    expect(row.tags).toEqual(["cache:hit", "catalog"]);
    expect(requestOf(t)).toBe(row);
  });

  it("uses the entry server span even when a downstream clock runs ahead", () => {
    const t = makeRequest({ path: "/api/gateway", service: "gateway" });
    const gateway = t.spans.find((s) => s.category === "http.server")!;
    const client = makeSpan({ traceId: t.traceId, category: "http.client", service: "gateway", parentSpanId: gateway.spanId, startMs: gateway.startMs + 1 });
    const downstream = makeSpan({ traceId: t.traceId, category: "http.server", service: "orders", parentSpanId: client.spanId, startMs: gateway.startMs - 5, attributes: { "url.path": "/orders" } });
    const row = requestOf(buildTrace(t.traceId, [...t.spans, client, downstream], [], []))!;
    expect(row).toMatchObject({ path: "/api/gateway", service: "gateway" });
  });

  it("takes the user's display name, and the user from a browser span when the server span has none", () => {
    expect(requestUserName(makeRequest({ attributes: { "enduser.id": "u1", "user.full_name": "Ada Lovelace" } }))).toBe("Ada Lovelace");
    expect(requestUserName(makeRequest({ attributes: { "enduser.id": "u1", "user.full_name": "[redacted]" } }))).toBeNull();
    const t = makeRequest({ fetchMs: 50 });
    const browser = t.spans.find((s) => s.category === "browser")!;
    browser.attributes["enduser.id"] = "u2";
    browser.attributes["user.full_name"] = "Grace Hopper";
    const trace = buildTrace(t.traceId, t.spans, [], []);
    expect(requestOf(trace)!.user).toBe("u2");
    expect(requestUserName(trace)).toBe("Grace Hopper");
  });

  it("marks failures and sorts newest first", () => {
    const a = makeRequest({ startMs: 1000 });
    const b = makeRequest({ startMs: 2000, status: 500, error: { type: "Boom", message: "bad" } });
    const rows = requestRows([a, b]);
    expect(rows.map((r) => r.traceId)).toEqual([b.traceId, a.traceId]);
    expect(rows[0]!.health).toBe("critical");
    expect(rows[0]!.errors).toBe(1);
  });
});
