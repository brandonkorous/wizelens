import { afterEach, beforeEach, expect, it } from "vitest";
import { parseTraceparent } from "@wizeworks/lens-core";
import { createRecorder } from "./recorder.js";
import { type Call, echoServer, postedSpans, stubPage } from "./test-env.js";

const realFetch = globalThis.fetch;
beforeEach(stubPage);
afterEach(() => {
  globalThis.fetch = realFetch;
});

it("adds traceparent, records the request, and posts browser spans", async () => {
  const calls: Call[] = [];
  globalThis.fetch = echoServer(calls);
  const mock = globalThis.fetch;
  const recorder = createRecorder({ endpoint: "/_wizelens", flushIntervalMs: 60_000 });
  const undo = recorder.install();
  expect(globalThis.fetch).not.toBe(mock);
  await fetch("/api/orders?x=1");

  const call = calls.find((c) => c.url.includes("/api/orders"))!;
  const tp = parseTraceparent(new Headers(call.init?.headers).get("traceparent"));
  expect(tp).not.toBeNull();
  const [req] = recorder.getSnapshot();
  expect(req).toMatchObject({ method: "GET", path: "/api/orders?x=1", status: 200, traceId: tp!.traceId, profiled: true });
  expect(recorder.traceLink(tp!.traceId)).toBe(`http://app.test/_wizelens/#/traces/${tp!.traceId}`);
  expect(recorder.traceLink(tp!.traceId, "sql")).toBe(`http://app.test/_wizelens/#/traces/${tp!.traceId}/sql`);

  await recorder.flush();
  const [span] = postedSpans(calls);
  expect(span).toMatchObject({ traceId: tp!.traceId, category: "browser", service: "browser" });
  expect(span!.attributes).toMatchObject({
    "wizelens.browser.session": recorder.sessionId,
    "wizelens.browser.type": "fetch",
    "wizelens.browser.route": "/page",
  });
  undo();
  expect(globalThis.fetch).toBe(mock);
});

it("does not profile calls to WizeLens or add traceparent cross-origin", async () => {
  const seen: (string | null)[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(new Headers(init?.headers).get("traceparent"));
    return new Response("{}");
  }) as typeof fetch;
  const recorder = createRecorder({ flushIntervalMs: 60_000 });
  const undo = recorder.install();
  await recorder.restore();
  seen.length = 0;
  await fetch("/_wizelens/api/traces");
  await fetch("https://other.example/x");
  expect(seen).toEqual([null, null]);
  expect(recorder.getSnapshot()).toHaveLength(1);
  undo();
});

it("records network errors", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  const recorder = createRecorder({ flushIntervalMs: 60_000 });
  const undo = recorder.install();
  await expect(fetch("/api/x")).rejects.toThrow("Failed to fetch");
  expect(recorder.getSnapshot()[0]).toMatchObject({ error: "Failed to fetch", profiled: false });
  undo();
});

it("marks a 5xx fetch span as an error", async () => {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response("{}", { status: 503 });
  }) as typeof fetch;
  const recorder = createRecorder({ flushIntervalMs: 60_000 });
  const undo = recorder.install();
  await recorder.restore();
  await fetch("/api/down");
  await recorder.flush();
  expect(postedSpans(calls)[0]).toMatchObject({ status: "error", statusMessage: "HTTP 503" });
  undo();
});
