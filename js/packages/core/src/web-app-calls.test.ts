import { describe, expect, it } from "vitest";
import { ATTR_BROWSER_CANCELLED, ATTR_BROWSER_PREFETCH, buildTrace, serviceFacts, serviceRows, type Span } from "./internal.js";
import { makeSpan } from "./testing/fixtures.js";

const fetchSpan = (durationMs: number, attributes: Span["attributes"] = {}): Span => makeSpan({ category: "browser", service: "browser", durationMs, attributes });

describe("Web App calls", () => {
  it("leaves prefetches and cancelled calls out of the Web App row and its latency", () => {
    const spans = [fetchSpan(40), fetchSpan(1, { [ATTR_BROWSER_PREFETCH]: true }), fetchSpan(2, { [ATTR_BROWSER_CANCELLED]: true })];
    const traces = spans.map((s, i) => buildTrace(String(i).repeat(32), [{ ...s, traceId: String(i).repeat(32) }], [], []));
    const web = serviceRows(traces).find((r) => r.key === "web:browser")!;
    expect(web).toMatchObject({ requests: 1, errors: 0, avgMs: 40 });
    const svc = traces.flatMap(serviceFacts).filter((c) => c.kind === "svc" && c.key === "web:browser");
    expect(svc).toHaveLength(1);
  });
});
