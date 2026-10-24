import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRecorder } from "./recorder.js";
import { type Call, postedSpans, stubPage, urlOf } from "./test-env.js";

const realFetch = globalThis.fetch;
beforeEach(stubPage);
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllGlobals();
});

/** A fetch that records calls and rejects app calls with `fail`. */
function failing(calls: Call[], fail: (init?: RequestInit) => unknown): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: urlOf(input), init });
    if (urlOf(input).includes("/api/")) throw fail(init);
    return new Response("{}");
  }) as typeof fetch;
}

async function sentSpan(calls: Call[], call: () => Promise<unknown>) {
  const recorder = createRecorder({ flushIntervalMs: 60_000, readServer: false });
  const undo = recorder.install();
  await call().catch(() => undefined);
  await recorder.flush();
  undo();
  return postedSpans(calls)[0]!;
}

it("does not count an aborted fetch as an error", async () => {
  const calls: Call[] = [];
  globalThis.fetch = failing(calls, () => new DOMException("The user aborted a request.", "AbortError"));
  const ctl = new AbortController();
  ctl.abort();
  const span = await sentSpan(calls, () => fetch("/api/x", { signal: ctl.signal }));
  expect(span.status).not.toBe("error");
  expect(span.events).toEqual([]);
  expect(span.attributes["wizelens.browser.cancelled"]).toBe(true);
});

it("does not count a fetch cut off by the page leaving as an error", async () => {
  const calls: Call[] = [];
  vi.stubGlobal("document", { visibilityState: "hidden" });
  globalThis.fetch = failing(calls, () => new TypeError("Failed to fetch"));
  const span = await sentSpan(calls, () => fetch("/api/x"));
  expect(span.status).not.toBe("error");
  expect(span.attributes["wizelens.browser.cancelled"]).toBe(true);
});

it("does not count a failed Next.js prefetch as an error", async () => {
  const calls: Call[] = [];
  globalThis.fetch = failing(calls, () => new TypeError("Failed to fetch"));
  const span = await sentSpan(calls, () => fetch("/api/page?_rsc=abc", { headers: { "Next-Router-Prefetch": "1" } }));
  expect(span.status).not.toBe("error");
  expect(span.events).toEqual([]);
  expect(span.attributes["wizelens.browser.prefetch"]).toBe(true);
});

it("still counts a real network failure as an error, with its real type", async () => {
  const calls: Call[] = [];
  globalThis.fetch = failing(calls, () => new TypeError("Failed to fetch"));
  const span = await sentSpan(calls, () => fetch("/api/x"));
  expect(span).toMatchObject({ status: "error", statusMessage: "Failed to fetch" });
  expect(span.events[0]!.attributes).toMatchObject({ "exception.type": "TypeError", "exception.message": "Failed to fetch" });
  expect(span.attributes["wizelens.browser.cancelled"]).toBeUndefined();
});
