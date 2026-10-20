import { describe, expect, it } from "vitest";
import { buildTrace, isErrorSpan, isFailed, requestRows, serviceFacts, spanDoc, type Span } from "./index.js";
import { makeSpan } from "./testing/fixtures.js";

const exception = { name: "exception", timeMs: 1, attributes: { "exception.message": "Builder page not found" } };

/** A server span that answered `code` and that the app marked as an error, with the exception it threw. */
const answered = (code: number, o: Partial<Span> = {}): Span =>
  makeSpan({ category: "http.server", kind: "server", status: "error", events: [exception], attributes: { "http.request.method": "GET", "url.path": "/x", "http.response.status_code": code }, ...o });

describe("4xx answers are not failures", () => {
  it("leaves out a 4xx span with an error status and an exception", () => {
    expect(isErrorSpan(answered(404))).toBe(false);
    expect(isErrorSpan(answered(422))).toBe(false);
    expect(isErrorSpan(answered(500))).toBe(true);
    expect(isErrorSpan(makeSpan({ category: "db", status: "error" }))).toBe(true);
  });

  it("does not fail a page that answered 200 after an internal 404 lookup", () => {
    const root = answered(200, { status: "unset", events: [], service: "site" });
    const call = makeSpan({ category: "http.client", kind: "client", parentSpanId: root.spanId, status: "error", attributes: { "http.response.status_code": 404 }, service: "site" });
    const lookup = answered(404, { parentSpanId: call.spanId, service: "api-rest" });
    const trace = buildTrace("a".repeat(32), [root, call, lookup], [], []);
    expect(trace.status).toBe("unset");
    expect(trace.errorCount).toBe(0);
    const [row] = requestRows([trace]);
    expect(row!.errors).toBe(0);
    expect(isFailed(row!)).toBe(false);
  });

  it("still fails a 5xx answer", () => {
    const trace = buildTrace("b".repeat(32), [answered(503)], [], []);
    expect(trace.status).toBe("error");
    expect(isFailed(requestRows([trace])[0]!)).toBe(true);
  });

  it("counts no error for a 4xx span in search and service stats", () => {
    const span = answered(404);
    expect(spanDoc(span).fields.error).toBe(false);
    const trace = buildTrace("c".repeat(32), [span], [], []);
    expect(serviceFacts(trace).every((c) => c.err === 0)).toBe(true);
  });
});
