import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTraceparent, type Span, type Trace, type TraceSummary } from "@wizeworks/lens-core";
import { createRecorder, getSessionId, mergeRequests, serverStatsFromTrace, summaryToRequest } from "./recorder.js";

// Vitest runs in Node: give the recorder a page origin and a sessionStorage.
vi.stubGlobal("location", new URL("http://app.test/page"));
const storage = new Map<string, string>();
vi.stubGlobal("sessionStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
});

describe("recorder", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("adds traceparent, records the request, and posts browser spans", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push({ url, init });
      const sent = parseTraceparent(new Headers(init?.headers).get("traceparent"));
      return new Response("{}", { status: 200, headers: sent ? { "X-WizeLens-Trace": sent.traceId } : {} });
    }) as typeof fetch;

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

    await recorder.flush();
    const post = calls.find((c) => c.url.endsWith("/_wizelens/api/client-spans"))!;
    const body = JSON.parse(String(post.init!.body)) as { spans: { traceId: string; category: string; service: string; attributes: Record<string, unknown> }[] };
    expect(body.spans[0]).toMatchObject({ traceId: tp!.traceId, category: "browser", service: "browser" });
    expect(body.spans[0]!.attributes["wizelens.browser.session"]).toBe(recorder.sessionId);

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

  it("keeps one session id per tab", () => {
    storage.clear();
    const first = getSessionId();
    expect(first).toMatch(/[0-9a-f-]{32,36}/);
    expect(getSessionId()).toBe(first);
    expect(createRecorder().sessionId).toBe(first);
    storage.clear();
    expect(getSessionId()).not.toBe(first);
  });

  it("works when storage is blocked", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    try {
      expect(getSessionId()).toBeTruthy();
    } finally {
      vi.stubGlobal("sessionStorage", {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => void storage.set(k, v),
      });
    }
  });

  it("restores this tab's earlier requests after a refresh, under live ones", async () => {
    const t = (traceId: string, startMs: number, extra: Partial<TraceSummary> = {}): TraceSummary => ({
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
    const restoredA = "a".repeat(32);
    const restoredB = "b".repeat(32);
    let restoreUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/_wizelens/api/traces")) {
        restoreUrl = url;
        return new Response(JSON.stringify([t(restoredB, 2000, { rootStatusCode: 500, status: "error" }), t(restoredA, 1000)]));
      }
      const sent = parseTraceparent(new Headers(init?.headers).get("traceparent"));
      return new Response("{}", { headers: sent ? { "X-WizeLens-Trace": sent.traceId } : {} });
    }) as typeof fetch;

    const recorder = createRecorder({ flushIntervalMs: 60_000, maxRecent: 30 });
    const undo = recorder.install();
    await recorder.restore();
    expect(restoreUrl).toContain(`session=${recorder.sessionId}`);
    expect(restoreUrl).toContain("limit=30");
    expect(recorder.getSnapshot().map((r) => r.traceId)).toEqual([restoredB, restoredA]);
    expect(recorder.getSnapshot()[1]).toMatchObject({ method: "GET", path: "/api/old?q=1", status: 200, durationMs: 12, profiled: true });
    expect(recorder.getSnapshot()[0]).toMatchObject({ status: 500, error: null });

    await fetch("/api/new");
    const rows = recorder.getSnapshot();
    expect(rows).toHaveLength(3);
    expect(rows[0]!.path).toBe("/api/new");
    undo();
  });

  it("merges without duplicate traces and keeps the newest", () => {
    const row = (traceId: string, startMs: number, restored = false) =>
      ({ id: `${restored ? "r" : "l"}${traceId}`, method: "GET", url: "/", path: "/", status: 200, durationMs: 1, traceId, profiled: true, startMs, error: null, restored });
    const merged = mergeRequests([row("x", 30)], [row("x", 30, true), row("y", 20, true), row("z", 10, true)], 2);
    expect(merged.map((r) => r.id)).toEqual(["lx", "ry"]);
    expect(summaryToRequest({ traceId: "q", rootName: "POST /api/a", service: "api", startMs: 1, durationMs: 2, status: "unset", spanCount: 1, dbCount: 0, httpClientCount: 0, errorCount: 0, services: ["api"], rootMethod: null, rootUrl: null, rootStatusCode: null }, "http://app.test/")).toMatchObject({ method: "POST", path: "/api/a" });
  });
  it("loads server stats for a profiled request", async () => {
    const span = (spanId: string, category: Span["category"], service: string, durationMs: number, extra: Partial<Span> = {}): Span => ({
      traceId: "t",
      spanId,
      parentSpanId: null,
      name: `${category} ${spanId}`,
      kind: "internal",
      category,
      service,
      startMs: Number(spanId),
      durationMs,
      status: "unset",
      statusMessage: null,
      attributes: {},
      events: [],
      ...extra,
    });
    let traceId = "";
    let reads = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes(`/_wizelens/api/traces/`)) {
        reads++;
        expect(url).toContain("federate=true");
        const trace = {
          traceId,
          spans: [
            span("1", "browser", "browser", 90),
            span("2", "http.server", "gateway", 70, { name: "GET /api/orders" }),
            span("3", "db", "gateway", 10),
            span("4", "http.client", "gateway", 30),
            span("5", "http.server", "orders", 25),
            span("6", "db", "orders", 5, { status: "error" }),
          ],
        } as Trace;
        return new Response(JSON.stringify(trace));
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
      name: "GET /api/orders",
      durationMs: 70,
      dbCount: 2,
      dbMs: 15,
      httpClientCount: 1,
      errorCount: 1,
      services: ["gateway", "orders"],
    });
    undo();
  });

  it("gives restored rows the summary counts", () => {
    const row = summaryToRequest({ traceId: "q", rootName: "fetch /api/a", service: "browser", startMs: 1, durationMs: 2, status: "unset", spanCount: 4, dbCount: 3, httpClientCount: 1, errorCount: 0, services: ["browser", "api"], rootMethod: "GET", rootUrl: "/api/a", rootStatusCode: 200 }, "http://app.test/");
    expect(row.server).toMatchObject({ dbCount: 3, dbMs: null, httpClientCount: 1, services: ["api"] });
    expect(serverStatsFromTrace({ spans: [] } as unknown as Trace)).toMatchObject({ name: null, durationMs: null, dbCount: 0 });
  });
});
