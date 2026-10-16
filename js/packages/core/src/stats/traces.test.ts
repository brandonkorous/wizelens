import { describe, expect, it } from "vitest";
import { buildTrace } from "../trace.js";
import { makeRequest, makeSpan } from "../testing/fixtures.js";
import { bottlenecks, criticalSpans, traceCards, traceLayers } from "./traces.js";

const T = "b".repeat(32);

/** Browser fetch → gateway (routed, handler → query, outbound call) → orders server. */
function fullTrace() {
  const fetch = makeSpan({ traceId: T, category: "browser", service: "browser", startMs: 0, durationMs: 100, attributes: { "wizelens.browser.render_ms": 20 } });
  const server = makeSpan({ traceId: T, category: "http.server", service: "gateway", parentSpanId: fetch.spanId, startMs: 10, durationMs: 80, attributes: { "wizelens.server.routed_ms": 5 } });
  const handler = makeSpan({ traceId: T, category: "internal", service: "gateway", parentSpanId: server.spanId, startMs: 15, durationMs: 70, attributes: { "wizelens.layer": "handler" } });
  const db = makeSpan({ traceId: T, category: "db", service: "gateway", parentSpanId: handler.spanId, startMs: 16, durationMs: 30, attributes: { "db.system.name": "sqlite" } });
  const client = makeSpan({ traceId: T, category: "http.client", service: "gateway", parentSpanId: handler.spanId, startMs: 50, durationMs: 30, attributes: { "url.full": "http://orders:5200/orders" } });
  const orders = makeSpan({ traceId: T, category: "http.server", service: "orders", parentSpanId: client.spanId, startMs: 55, durationMs: 20 });
  const ext = makeSpan({ traceId: T, category: "http.client", service: "orders", parentSpanId: orders.spanId, startMs: 60, durationMs: 8, attributes: { "url.full": "https://api.stripe.com/v1/x" } });
  return buildTrace(T, [fetch, server, handler, db, client, orders, ext], [], []);
}

describe("trace layers", () => {
  it("splits a trace into layers by own time", () => {
    const layers = Object.fromEntries(traceLayers(fullTrace()).map((l) => [l.key, l]));
    expect(layers["browser"]).toMatchObject({ totalMs: 100, envelope: true });
    expect(layers["network"]!.totalMs).toBe(30);
    expect(layers["routing"]!.totalMs).toBe(5);
    expect(layers["service:gateway"]!.totalMs).toBe(5);
    expect(layers["handler"]!.totalMs).toBe(10);
    expect(layers["db:sqlite"]!.totalMs).toBe(30);
    expect(layers["service:orders"]!.totalMs).toBe(12);
    expect(layers["ext:api.stripe.com"]!.totalMs).toBe(8);
    expect(layers["render"]).toMatchObject({ totalMs: 20, segments: [{ startMs: 100, durationMs: 20 }] });
  });

  it("orders rows by start time", () => {
    expect(traceLayers(fullTrace()).map((l) => l.key).slice(0, 3)).toEqual(["browser", "network", "routing"]);
  });
});

describe("bottlenecks and critical spans", () => {
  it("shares time by layer and by service", () => {
    const byLayer = bottlenecks([fullTrace()]);
    expect(byLayer[0]).toMatchObject({ key: "network", totalMs: 30 });
    expect(byLayer.reduce((t, b) => t + b.share, 0)).toBeCloseTo(100);
    expect(bottlenecks([fullTrace()], "service").find((b) => b.key === "gateway")?.totalMs).toBe(50);
  });

  it("lists the slowest spans below the root", () => {
    const spans = criticalSpans([fullTrace()], 3);
    expect(spans.map((s) => s.name)).toEqual(["internal", "db", "http.client"]);
    expect(spans[1]!.layer).toBe("sqlite");
  });
});

describe("trace cards", () => {
  it("counts traces, spans, and slow traces", () => {
    const a = makeRequest({ startMs: 1000, serverMs: 600 });
    const b = makeRequest({ startMs: 2000, serverMs: 20, queries: [{ sql: "SELECT 1", ms: 1 }] });
    const cards = traceCards([a, b], { from: 0, to: 4000 }, 4);
    expect(cards).toMatchObject({ count: 2, avgSpans: 1.5, slow: 1 });
    expect(cards.series.count).toEqual([0, 1, 1, 0]);
  });
});
