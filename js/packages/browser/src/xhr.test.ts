import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseTraceparent, type Span } from "@wizeworks/lens-core/internal";
import { createRecorder } from "./recorder.js";
import { settle } from "./test-dom.js";
import { type Call, postedSpans, stubPage } from "./test-env.js";

// Answers like a WizeLens server: it echoes the trace id it was sent, unless the network is down.
class FakeXhr extends EventTarget {
  static sent: { url: string; headers: Record<string, string> }[] = [];
  static down = false;
  readyState = 0;
  status = 0;
  #url = "";
  #headers: Record<string, string> = {};
  #trace: string | null = null;
  open(_method: string, url: string) {
    this.#url = url;
    this.readyState = 1;
  }
  setRequestHeader(name: string, value: string) {
    this.#headers[name] = value;
  }
  getResponseHeader(name: string) {
    return name.toLowerCase() === "x-wizelens-trace" ? this.#trace : null;
  }
  send() {
    FakeXhr.sent.push({ url: this.#url, headers: this.#headers });
    setTimeout(() => {
      if (!FakeXhr.down) {
        this.#trace = parseTraceparent(this.#headers.traceparent ?? null)?.traceId ?? null;
        this.readyState = 2;
        this.dispatchEvent(new Event("readystatechange"));
        this.status = 200;
      }
      this.readyState = 4;
      this.dispatchEvent(new Event(FakeXhr.down ? "error" : "load"));
      this.dispatchEvent(new Event("loadend"));
    }, 1);
  }
}

function request(url: string): Promise<void> {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url);
  xhr.send();
  return new Promise((r) => xhr.addEventListener("loadend", () => r()));
}

const realFetch = globalThis.fetch;
let calls: Call[];

beforeEach(() => {
  stubPage();
  FakeXhr.sent = [];
  FakeXhr.down = false;
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllGlobals();
});

async function record(run: () => Promise<void>): Promise<Span[]> {
  const recorder = createRecorder({ flushIntervalMs: 60_000, readServer: false, capturePages: false });
  const undo = recorder.install();
  await run();
  await settle();
  await recorder.flush();
  undo();
  return postedSpans(calls);
}

it("adds traceparent to XHR calls and sends a span in the server's trace", async () => {
  const [span] = await record(() => request("/api/cart?x=1"));
  const tp = parseTraceparent(FakeXhr.sent[0]!.headers.traceparent ?? null)!;
  expect(span).toMatchObject({ traceId: tp.traceId, spanId: tp.spanId, name: "xhr /api/cart", status: "unset" });
  expect(span!.attributes).toMatchObject({ "http.request.method": "GET", "http.response.status_code": 200, "url.full": "http://app.test/api/cart?x=1" });
});

it("records a network error, and leaves WizeLens and cross-origin calls alone", async () => {
  FakeXhr.down = true;
  const spans = await record(async () => {
    await request("/api/down");
    await request("/_wizelens/api/traces");
    await request("https://other.example/x");
  });
  expect(FakeXhr.sent.map((s) => s.headers.traceparent ?? null)).toEqual([expect.any(String), null, null]);
  expect(spans.map((s) => s.name)).toEqual(["xhr /api/down", "xhr /x"]);
  expect(spans[0]).toMatchObject({ status: "error", statusMessage: "Network error" });
});

it("puts XMLHttpRequest back when uninstalled", () => {
  const { open, send } = FakeXhr.prototype;
  const undo = createRecorder({ readServer: false, capturePages: false }).install();
  expect(FakeXhr.prototype.open).not.toBe(open);
  undo();
  expect(FakeXhr.prototype).toMatchObject({ open, send });
});
