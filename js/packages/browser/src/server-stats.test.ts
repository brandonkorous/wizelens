import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseTraceparent, type Span, type Trace } from "@wizeworks/lens-core/internal";
import { createRecorder } from "./recorder.js";
import { type Call, postedSpans, span, stubPage, urlOf } from "./test-env.js";

const realFetch = globalThis.fetch;
beforeEach(stubPage);
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllGlobals();
});

const SPANS: Span[] = [
  span("1", "browser", "browser", 90),
  span("2", "http.server", "gateway", 70, { name: "GET /api/orders" }),
  span("3", "db", "gateway", 10, { startMs: 5 }),
  span("4", "http.client", "gateway", 30, { startMs: 20 }),
  span("5", "http.server", "orders", 25, { startMs: 22 }),
  span("6", "db", "orders", 5, { startMs: 30, status: "error" }),
];

it("loads server stats for a profiled request", async () => {
  let traceId = "";
  let reads = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    if (url.includes(`/_wizelens/api/traces/`)) {
      reads++;
      expect(url).toContain("federate=true");
      return new Response(JSON.stringify({ traceId, spans: SPANS } as Trace));
    }
    if (url.includes("/_wizelens/")) return new Response("[]");
    traceId = parseTraceparent(new Headers(init?.headers).get("traceparent"))!.traceId;
    return new Response("{}", { headers: { "X-WizeLens-Trace": traceId } });
  }) as typeof fetch;
  const recorder = createRecorder({ flushIntervalMs: 60_000, serverStatsDelayMs: 60_000 });
  const undo = recorder.install();
  await recorder.restore();
  await fetch("/api/orders");
  await recorder.loadServerStats(traceId);
  await recorder.loadServerStats(traceId);
  expect(reads).toBe(1);
  expect(recorder.getSnapshot()[0]!.server).toEqual({
    name: "GET /api/orders", durationMs: 70, dbCount: 2, dbMs: 15, dbTotalMs: 15, dbSlowestMs: 10, dbDurations: [10, 5],
    httpClientCount: 1, errorCount: 1, insights: 0, parts: { codeMs: 30, dbMs: 10, httpOutMs: 30, httpOutCount: 1 },
    services: ["gateway", "orders"],
  });
  expect(recorder.getTrace(traceId)?.spans).toHaveLength(6);
  undo();
});

it("measures render time after the app reads the body, then sends the span", async () => {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response('{"ok":true}');
  }) as typeof fetch;
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("document", { visibilityState: "visible" });
  const recorder = createRecorder({ flushIntervalMs: 60_000 });
  const undo = recorder.install();
  await recorder.restore();
  const res = await fetch("/api/render");
  expect(recorder.getSnapshot()[0]!.renderMs).toBeNull();
  expect(await res.json()).toEqual({ ok: true });
  await vi.waitFor(() => expect(frames).toHaveLength(1));
  frames[0]!(0);
  await vi.waitFor(() => expect(recorder.getSnapshot()[0]!.renderMs).toBeGreaterThanOrEqual(0));
  await recorder.flush();
  expect(postedSpans(calls)[0]!.attributes["wizelens.browser.render_ms"]).toBeTypeOf("number");
  undo();
});
