import { afterEach, beforeEach, expect, it } from "vitest";
import { parseTraceparent, type Trace, type TraceSummary } from "@wizeworks/lens-core/internal";
import { createRecorder } from "./recorder.js";
import { mergeRequests, serverStatsFromTrace, summaryToRequest } from "./requests.js";
import { stubPage, urlOf } from "./test-env.js";

const realFetch = globalThis.fetch;
beforeEach(stubPage);
afterEach(() => {
  globalThis.fetch = realFetch;
});

const summary = (traceId: string, startMs: number, extra: Partial<TraceSummary> = {}): TraceSummary => ({
  traceId,
  rootName: "fetch /api/old",
  service: "browser",
  startMs,
  durationMs: 12,
  status: "unset",
  spanCount: 3,
  dbCount: 1,
  httpClientCount: 0,
  errorCount: 0,
  services: ["browser", "api"],
  rootMethod: "GET",
  rootUrl: "http://app.test/api/old?q=1",
  rootStatusCode: 200,
  ...extra,
});

it("restores this tab's earlier requests after a refresh, under live ones", async () => {
  const [a, b] = ["a".repeat(32), "b".repeat(32)];
  let restoreUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    if (url.includes("/_wizelens/api/traces")) {
      restoreUrl = url;
      return new Response(JSON.stringify([summary(b, 2000, { rootStatusCode: 500, status: "error" }), summary(a, 1000)]));
    }
    const sent = parseTraceparent(new Headers(init?.headers).get("traceparent"));
    return new Response("{}", { headers: sent ? { "X-WizeLens-Trace": sent.traceId } : {} });
  }) as typeof fetch;
  const recorder = createRecorder({ flushIntervalMs: 60_000, maxRecent: 30 });
  const undo = recorder.install();
  await recorder.restore();
  expect(restoreUrl).toContain(`session=${recorder.sessionId}`);
  expect(restoreUrl).toContain("limit=30");
  expect(recorder.getSnapshot().map((r) => r.traceId)).toEqual([b, a]);
  expect(recorder.getSnapshot()[1]).toMatchObject({ method: "GET", path: "/api/old?q=1", status: 200, durationMs: 12, profiled: true });
  expect(recorder.getSnapshot()[0]).toMatchObject({ status: 500, error: null });
  await fetch("/api/new");
  expect(recorder.getSnapshot()).toHaveLength(3);
  expect(recorder.getSnapshot()[0]!.path).toBe("/api/new");
  undo();
});

it("merges without duplicate traces and keeps the newest", () => {
  const row = (traceId: string, startMs: number, restored = false) =>
    ({ id: `${restored ? "r" : "l"}${traceId}`, method: "GET", url: "/", path: "/", status: 200, durationMs: 1, renderMs: null, traceId, profiled: true, startMs, error: null, restored });
  const merged = mergeRequests([row("x", 30)], [row("x", 30, true), row("y", 20, true), row("z", 10, true)], 2);
  expect(merged.map((r) => r.id)).toEqual(["lx", "ry"]);
  const post = summary("q", 1, { rootName: "POST /api/a", rootMethod: null, rootUrl: null });
  expect(summaryToRequest(post, "http://app.test/")).toMatchObject({ method: "POST", path: "/api/a" });
});

it("gives restored rows the summary counts", () => {
  const row = summaryToRequest(summary("q", 1, { dbCount: 3, httpClientCount: 1, rootUrl: "/api/a" }), "http://app.test/");
  expect(row.server).toMatchObject({ dbCount: 3, dbMs: null, httpClientCount: 1, services: ["api"] });
  expect(serverStatsFromTrace({ spans: [] } as unknown as Trace)).toMatchObject({ name: null, durationMs: null, dbCount: 0 });
});
