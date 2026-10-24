import { describe, expect, it } from "vitest";
import {
  ATTR_EXPECTED,
  ATTR_EXPECTED_HEADER,
  buildTrace,
  errorEvents,
  errorRateOf,
  isErrorSpan,
  isExpectedSpan,
  isFailed,
  requestRows,
  serviceFacts,
  spanDoc,
  type Span,
} from "./index.js";
import { requestDoc } from "./search/docs.js";
import { requestItemOf } from "./scale/facts-lists.js";
import { makeSpan } from "./testing/fixtures.js";

const exception = { name: "exception", timeMs: 1, attributes: { "exception.type": "Error", "exception.message": "boom" } };

/** A server span that answered `code` with an error status, as an OpenTelemetry SDK records any 5xx. */
const answered = (code: number, attributes: Span["attributes"] = {}, o: Partial<Span> = {}): Span =>
  makeSpan({ category: "http.server", kind: "server", status: "error", attributes: { "http.request.method": "GET", "url.path": "/", "http.response.status_code": code, ...attributes }, ...o });

const rowOf = (span: Span) => requestRows([buildTrace(span.traceId, [span], [], [])])[0]!;

describe("an expected answer is not a failure", () => {
  it("reads the attribute and the response header", () => {
    expect(isExpectedSpan(answered(503, { [ATTR_EXPECTED]: true }))).toBe(true);
    expect(isExpectedSpan(answered(503, { [ATTR_EXPECTED]: "1" }))).toBe(true);
    expect(isExpectedSpan(answered(503, { [ATTR_EXPECTED_HEADER]: "1" }))).toBe(true);
    expect(isExpectedSpan(answered(503, { [ATTR_EXPECTED_HEADER]: "false" }))).toBe(false);
    expect(isExpectedSpan(answered(503))).toBe(false);
  });

  it("does not fail an expected 503, and keeps its status", () => {
    const span = answered(503, { [ATTR_EXPECTED_HEADER]: "1" });
    const trace = buildTrace(span.traceId, [span], [], []);
    expect(isErrorSpan(span)).toBe(false);
    expect(trace.status).not.toBe("error");
    expect(trace.errorCount).toBe(0);
    const row = rowOf(span);
    expect(row.status).toBe(503);
    expect(row.expected).toBe(true);
    expect(isFailed(row)).toBe(false);
    expect(row.health).not.toBe("critical");
    expect(errorRateOf([row])).toBe(0);
  });

  it("makes no error group, service error, or search error", () => {
    const span = answered(503, { [ATTR_EXPECTED]: true });
    const trace = buildTrace(span.traceId, [span], [], []);
    expect(errorEvents([trace])).toHaveLength(0);
    expect(serviceFacts(trace).every((c) => c.err === 0)).toBe(true);
    expect(spanDoc(span).fields.error).toBe(false);
    expect(requestDoc(requestItemOf(rowOf(span))).fields.error).toBe(false);
  });

  it("still fails an expected answer that threw", () => {
    const span = answered(503, { [ATTR_EXPECTED]: true }, { events: [exception] });
    expect(isErrorSpan(span)).toBe(true);
    expect(isFailed(rowOf(span))).toBe(true);
  });

  it("still fails a 503 nobody marked", () => {
    const span = answered(503);
    expect(isErrorSpan(span)).toBe(true);
    const row = rowOf(span);
    expect(row.expected).toBe(false);
    expect(isFailed(row)).toBe(true);
    expect(row.health).toBe("critical");
    expect(errorEvents([buildTrace(span.traceId, [span], [], [])])).toHaveLength(1);
  });
});

describe("an expected answer across the trace", () => {
  it("does not fail the framework's child span that repeats an expected 503", () => {
    const root = answered(503, { [ATTR_EXPECTED]: true });
    const child = makeSpan({ traceId: root.traceId, parentSpanId: root.spanId, category: "internal", name: "BaseServer.handleRequest", status: "error", attributes: { "error.type": "503" } });
    const trace = buildTrace(root.traceId, [root, child], [], []);
    expect(trace.errorCount).toBe(0);
    expect(trace.status).not.toBe("error");
    expect(errorEvents([trace])).toHaveLength(0);
    const row = requestRows([trace])[0]!;
    expect(row).toMatchObject({ errors: 0, expected: true });
    expect(row.findings.filter((f) => f.kind === "error")).toHaveLength(0);
    const thrown = { ...child, events: [exception] };
    expect(errorEvents([buildTrace(root.traceId, [root, thrown], [], [])])).toHaveLength(1);
  });
});
