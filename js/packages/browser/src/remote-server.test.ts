import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ATTR_BROWSER_REMOTE, parseTraceparent, type Trace } from "@wizeworks/lens-core";
import { loadView } from "./pageview-tracker.js";
import { createRecorder } from "./recorder.js";
import { type Call, postedSpans, span, stubPage, urlOf } from "./test-env.js";

const realFetch = globalThis.fetch;
beforeEach(stubPage);
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllGlobals();
  delete (globalThis as { __wizelensLoadView?: unknown }).__wizelensLoadView;
});

const PAGE_SERVER = "http://app.test/_wizelens";

it("reads a trace from the server that answered, not the configured endpoint", async () => {
  const calls: Call[] = [];
  let traceId = "";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    calls.push({ url, init });
    if (url.includes("/_wizelens/api/traces/")) return new Response(JSON.stringify({ traceId, spans: [span("1", "http.server", "web", 40)] } as Trace));
    if (url.includes("/_wizelens/")) return new Response("[]");
    traceId = parseTraceparent(new Headers(init?.headers).get("traceparent"))!.traceId;
    return new Response("{}", { headers: { "X-WizeLens-Trace": traceId, "X-WizeLens-Endpoint": `${PAGE_SERVER}/` } });
  }) as typeof fetch;
  const recorder = createRecorder({ endpoint: "http://api.test/_wizelens", flushIntervalMs: 60_000, serverStatsDelayMs: 60_000 });
  const undo = recorder.install();
  await fetch("/orders");
  await recorder.loadServerStats(traceId);
  expect(calls.some((c) => c.url === `${PAGE_SERVER}/api/traces/${traceId}?federate=true`)).toBe(true);
  expect(recorder.traceLink(traceId)).toBe(`${PAGE_SERVER}/#/traces/${traceId}`);
  expect(recorder.getSnapshot()[0]!.server?.name).toBe("http.server 1");
  undo();
  await new Promise((r) => setTimeout(r, 2100));
  const fetchSpan = postedSpans(calls).find((s) => s.attributes["url.full"] === "http://app.test/orders")!;
  expect(fetchSpan.attributes[ATTR_BROWSER_REMOTE]).toBe(PAGE_SERVER);
  const postedTo = calls.filter((c) => c.url.endsWith("/api/client-spans")).map((c) => c.url);
  expect(postedTo).toEqual([`${PAGE_SERVER}/api/client-spans`]);
});

it("sends spans of a trace on another origin to the configured endpoint", async () => {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: urlOf(input), init });
    const traceId = parseTraceparent(new Headers(init?.headers).get("traceparent"))?.traceId ?? "";
    return new Response("[]", { headers: { "X-WizeLens-Trace": traceId, "X-WizeLens-Endpoint": "http://evil.test/_wizelens" } });
  }) as typeof fetch;
  const recorder = createRecorder({ endpoint: "http://api.test/_wizelens", flushIntervalMs: 60_000, serverStatsDelayMs: 60_000 });
  const undo = recorder.install();
  await fetch("/orders");
  undo();
  await new Promise((r) => setTimeout(r, 2100));
  const postedTo = new Set(calls.filter((c) => c.url.endsWith("/api/client-spans")).map((c) => c.url));
  expect([...postedTo]).toEqual(["http://api.test/_wizelens/api/client-spans"]);
});

function stubNavigation(serverTiming: { name: string; description: string }[]): void {
  vi.stubGlobal("performance", { timeOrigin: 1000, now: () => 0, getEntriesByType: (t: string) => (t === "navigation" ? [{ serverTiming }] : []) });
}

it("joins the page load to the server trace of the document", () => {
  const traceId = "ab".repeat(16);
  stubNavigation([{ name: "wl-trace", description: traceId }, { name: "wl-endpoint", description: PAGE_SERVER }]);
  expect(loadView()).toMatchObject({ traceId, remote: PAGE_SERVER, sent: false });
});

it("starts its own trace when the document has no WizeLens timing", () => {
  stubNavigation([{ name: "wl-trace", description: "not-a-trace-id" }]);
  expect(loadView()).toMatchObject({ remote: null });
  expect(loadView().traceId).toMatch(/^[0-9a-f]{32}$/);
});
