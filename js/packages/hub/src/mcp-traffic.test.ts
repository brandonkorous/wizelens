import { afterEach, expect, it } from "vitest";
import type { Hub } from "./hub.js";
import { settleHub } from "./settle.js";
import { post, span, startHub } from "./test/helpers.js";

let hub: Hub;
afterEach(() => hub?.close());

const headers = { Accept: "application/json, text/event-stream" };
type Call = { result: { content: { text: string }[]; isError?: boolean } };
const call = async (url: string, name: string, args: object) =>
  ((await (await post(`${url}/_wizelens/mcp`, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, headers)).json()) as Call).result;
const parsed = async <T>(url: string, name: string, args: object) => JSON.parse((await call(url, name, args)).content[0]!.text) as T;

const request = (i: number, method: string, route: string, status: number, durationMs: number) => {
  const attributes = { "http.request.method": method, "http.route": route, "url.path": route, "http.response.status_code": status };
  return span(String(i + 1).padStart(32, "a"), String(i + 1).padStart(16, "b"), { service: "billing", startMs: Date.now() - 60_000 - i * 1000, durationMs, attributes, ...(status >= 500 ? { status: "error" } : {}) });
};

/** A hub with billing traffic: three GET /orders (one fails) and one slow POST /pay. */
async function withTraffic(): Promise<string> {
  let url: string;
  ({ hub, url } = await startHub({ mcp: true }));
  const spans = [request(0, "GET", "/orders", 200, 10), request(1, "GET", "/orders", 500, 20), request(2, "GET", "/orders", 200, 30), request(3, "POST", "/pay", 200, 900)];
  await post(`${url}/_wizelens/api/ingest`, { sender: { service: "billing" }, spans });
  settleHub(hub.data.store);
  return url;
}

type Series = { totals: { requests: number; errors: number }; points: { requests: number }[]; bucketMinutes: number; scope: { found: boolean } };
type Groups = { endpoints: number; requests: number; rows: { service: string; endpoint: string; requests: number; errors: number; p95Ms: number }[] };

it("get_timeseries counts every request per bucket, for all, one service, and one endpoint", async () => {
  const url = await withTraffic();
  const all = await parsed<Series>(url, "get_timeseries", { range: "1h", buckets: "16" });
  expect(all.points).toHaveLength(16);
  expect(all.totals).toMatchObject({ requests: 4, errors: 1 });
  expect(all.points.reduce((t, p) => t + p.requests, 0)).toBe(4);
  expect(all.bucketMinutes).toBe(3.75);
  expect((await parsed<Series>(url, "get_timeseries", { range: "1h", service: "billing", endpoint: "GET /orders" })).totals).toMatchObject({ requests: 3, errors: 1 });
  expect((await parsed<Series>(url, "get_timeseries", { range: "1h", service: "nope" })).scope.found).toBe(false);
});

it("group_requests gives each endpoint's count, errors, and p95, in the order asked", async () => {
  const url = await withTraffic();
  const busiest = await parsed<Groups>(url, "group_requests", { range: "1h" });
  expect(busiest).toMatchObject({ endpoints: 2, requests: 4 });
  expect(busiest.rows.map((r) => [r.endpoint, r.requests, r.errors])).toEqual([["GET /orders", 3, 1], ["POST /pay", 1, 0]]);
  const slowest = await parsed<Groups>(url, "group_requests", { range: "1h", sort: "p95", limit: 1 });
  expect(slowest.rows).toEqual([expect.objectContaining({ service: "billing", endpoint: "POST /pay" })]);
  expect(slowest.rows[0]!.p95Ms).toBeGreaterThan(500);
});

it("takes a custom from–to window, and says when a time is wrong", async () => {
  const url = await withTraffic();
  const now = Date.now();
  const custom = await parsed<Series>(url, "get_timeseries", { from: new Date(now - 30 * 60_000).toISOString(), to: new Date(now).toISOString() });
  expect(custom.totals.requests).toBe(4);
  const bad = await call(url, "group_requests", { from: "yesterday", to: "today" });
  expect(bad.isError).toBe(true);
  expect(bad.content[0]!.text).toContain("ISO 8601");
});
