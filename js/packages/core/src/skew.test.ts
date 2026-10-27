import { describe, expect, it } from "vitest";
import { makeSpan } from "./testing/fixtures.js";
import { buildTrace } from "./trace.js";

describe("clock skew", () => {
  const gateway = makeSpan({ category: "http.server", service: "gateway", spanId: "a".repeat(16), startMs: 1000, durationMs: 100 });
  const call = makeSpan({ category: "http.client", service: "gateway", spanId: "b".repeat(16), parentSpanId: gateway.spanId, startMs: 1020, durationMs: 40 });

  it("moves a downstream service that started before its caller", () => {
    const orders = makeSpan({ category: "http.server", service: "orders", spanId: "c".repeat(16), parentSpanId: call.spanId, startMs: 1010, durationMs: 30 });
    const query = makeSpan({ category: "db", service: "orders", spanId: "d".repeat(16), parentSpanId: orders.spanId, startMs: 1015, durationMs: 5 });
    const log = { timeMs: 1016, level: "info" as const, category: "orders", message: "hi", service: "orders", spanId: orders.spanId, attributes: {} };
    const t = buildTrace("t".repeat(32), [gateway, call, orders, query], [log], []);
    const byId = new Map(t.spans.map((s) => [s.spanId, s]));
    expect(byId.get(orders.spanId)!.startMs).toBe(1025);
    expect(byId.get(query.spanId)!.startMs).toBe(1030);
    expect(t.logs[0]!.timeMs).toBe(1031);
  });

  it("starts a span with its parent when it claims to start before it, in the same service", () => {
    // Next.js reports clientComponentLoading from the first unreported chunk load, which can be hours old.
    const stale = makeSpan({ category: "internal", service: "gateway", spanId: "e".repeat(16), parentSpanId: gateway.spanId, startMs: 1000 - 2_181_000, durationMs: 40 });
    const t = buildTrace("t".repeat(32), [gateway, call, stale], [], []);
    expect(t.spans.find((s) => s.spanId === stale.spanId)!.startMs).toBe(1000);
    expect(t.startMs).toBe(1000);
    expect(t.durationMs).toBe(100);
  });

  it("moves a server span inside the cross-origin fetch that joined its trace, with no traceparent", () => {
    const fetch = makeSpan({ category: "browser", service: "browser", spanId: "f".repeat(16), startMs: 1031, durationMs: 17, attributes: { "url.full": "http://api.test/api/v1/boards/b1" } });
    const api = makeSpan({ category: "http.server", service: "api", spanId: "9".repeat(16), startMs: 1000, durationMs: 7, attributes: { "url.path": "/api/v1/boards/b1" } });
    const t = buildTrace("t".repeat(32), [fetch, api], [], []);
    expect(t.spans.find((s) => s.service === "api")!.startMs).toBe(1036);
    expect(t.durationMs).toBe(17);
  });

  it("leaves spans that already fit alone", () => {
    const orders = makeSpan({ category: "http.server", service: "orders", parentSpanId: call.spanId, startMs: 1025, durationMs: 30 });
    const t = buildTrace("t".repeat(32), [gateway, call, orders], [], []);
    expect(t.spans.find((s) => s.service === "orders")!.startMs).toBe(1025);
  });
});
