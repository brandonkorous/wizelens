import { describe, expect, it } from "vitest";
import {
  analyzeTrace,
  buildTrace,
  findDuplicateQueries,
  findNPlusOneDb,
  findNPlusOneHttp,
  findSlowQueries,
  formatTraceparent,
  mergeTraces,
  newSpanId,
  newTraceId,
  parseTraceparent,
  pathShape,
  redactAttributes,
  redactParams,
  toSummary,
  type Span,
} from "./index.js";

let clock = 1_000;
function span(partial: Partial<Span> & Pick<Span, "category">): Span {
  const start = partial.startMs ?? (clock += 10);
  return {
    traceId: "a".repeat(32),
    spanId: newSpanId(),
    parentSpanId: null,
    name: partial.category,
    kind: "internal",
    service: "svc",
    startMs: start,
    durationMs: 5,
    status: "unset",
    statusMessage: null,
    attributes: {},
    events: [],
    ...partial,
  };
}
const db = (sql: string, params: string | null = null, durationMs = 5) =>
  span({ category: "db", durationMs, attributes: { "db.query.text": sql, "wizelens.db.parameters": params } });
const http = (url: string) =>
  span({ category: "http.client", kind: "client", attributes: { "http.request.method": "GET", "url.full": url } });
const trace = (spans: Span[]) => buildTrace("a".repeat(32), spans, [], []);

describe("ids and traceparent", () => {
  it("generates W3C ids", () => {
    expect(newTraceId()).toMatch(/^[0-9a-f]{32}$/);
    expect(newSpanId()).toMatch(/^[0-9a-f]{16}$/);
  });

  it("round-trips traceparent", () => {
    const t = newTraceId();
    const s = newSpanId();
    expect(parseTraceparent(formatTraceparent(t, s))).toEqual({ traceId: t, spanId: s, sampled: true });
  });

  it("rejects invalid traceparent", () => {
    expect(parseTraceparent("garbage")).toBeNull();
    expect(parseTraceparent(`00-${"0".repeat(32)}-${"1".repeat(16)}-01`)).toBeNull();
    expect(parseTraceparent(`ff-${"1".repeat(32)}-${"1".repeat(16)}-01`)).toBeNull();
    expect(parseTraceparent(undefined)).toBeNull();
  });
});

describe("redaction", () => {
  it("redacts sensitive attribute keys", () => {
    expect(redactAttributes({ "http.request.header.authorization": "Bearer x", "url.path": "/a" })).toEqual({
      "http.request.header.authorization": "[redacted]",
      "url.path": "/a",
    });
  });

  it("redacts named params and keeps positional ones", () => {
    expect(redactParams({ id: 1, Password: "p" })).toBe('{"id":1,"Password":"[redacted]"}');
    expect(redactParams([1, "x"])).toBe('[1,"x"]');
    expect(redactParams(undefined)).toBeNull();
  });
});

describe("path shape", () => {
  it("replaces numbers, guids, and query values", () => {
    expect(pathShape("/orders/42")).toBe("/orders/{}");
    expect(pathShape("/u/3f2504e0-4f89-11d3-9a0c-0305e82c3301/x")).toBe("/u/{}/x");
    expect(pathShape("/orders?customerId=3&x=y")).toBe("/orders?customerId={}&x={}");
  });
});

describe("analysis", () => {
  it("finds duplicate queries only when params match", () => {
    const t = trace([db("SELECT 1", "[1]"), db("SELECT 1", "[1]"), db("SELECT 1", "[2]")]);
    const found = findDuplicateQueries(t);
    expect(found).toHaveLength(1);
    expect(found[0]!.count).toBe(2);
  });

  it("finds N+1 db at the threshold", () => {
    const four = trace([1, 2, 3, 4].map((i) => db("SELECT * FROM o WHERE c = ?", `[${i}]`)));
    expect(findNPlusOneDb(four)).toHaveLength(0);
    const five = trace([1, 2, 3, 4, 5].map((i) => db("SELECT * FROM o WHERE c = ?", `[${i}]`)));
    expect(findNPlusOneDb(five)[0]!.count).toBe(5);
  });

  it("finds N+1 http by shape", () => {
    const t = trace([1, 2, 3, 4, 5].map((i) => http(`http://localhost:5200/orders?customerId=${i}`)));
    const found = findNPlusOneHttp(t);
    expect(found).toHaveLength(1);
    expect(found[0]!.shape).toBe("GET localhost:5200/orders?customerId={}");
  });

  it("finds slow queries", () => {
    expect(findSlowQueries(trace([db("A", null, 99), db("B", null, 100)]))).toHaveLength(1);
  });

  it("reports errors from status and exception events", () => {
    const t = trace([
      span({ category: "internal", status: "error", statusMessage: "bad" }),
      span({
        category: "internal",
        events: [{ name: "exception", timeMs: 1, attributes: { "exception.message": "boom" } }],
      }),
    ]);
    expect(analyzeTrace(t).filter((f) => f.kind === "error")).toHaveLength(2);
  });
});

describe("trace building and merging", () => {
  it("computes summary fields", () => {
    const root = span({ category: "http.server", startMs: 100, durationMs: 50, service: "a", name: "GET /" });
    const child = db("SELECT 1");
    child.parentSpanId = root.spanId;
    child.startMs = 120;
    child.durationMs = 40; // ends at 160, after root
    const t = trace([child, root]);
    expect(t.rootName).toBe("GET /");
    expect(t.durationMs).toBe(60);
    expect(t.dbCount).toBe(1);
    expect(toSummary(t)).not.toHaveProperty("spans");
    expect(t).toMatchObject({ rootMethod: null, rootUrl: null, rootStatusCode: null });
  });

  it("reads method, url and status code from the root span", () => {
    const server = span({
      category: "http.server",
      attributes: { "http.request.method": "GET", "url.path": "/api/orders", "url.full": "http://x/api/orders?a=1", "http.response.status_code": 200 },
    });
    expect(trace([server])).toMatchObject({ rootMethod: "GET", rootUrl: "/api/orders", rootStatusCode: 200 });
    const browser = span({
      category: "browser",
      attributes: { "http.request.method": "POST", "url.full": "http://app/api/x", "http.response.status_code": "500" },
    });
    const child = span({ category: "http.server", parentSpanId: browser.spanId, attributes: { "url.path": "/api/x" } });
    expect(trace([child, browser])).toMatchObject({ rootMethod: "POST", rootUrl: "http://app/api/x", rootStatusCode: 500 });
  });

  it("uses the orphan span as root when no span lacks a parent", () => {
    const s = span({ category: "http.server", parentSpanId: "b".repeat(16), name: "orphan" });
    expect(trace([s]).rootName).toBe("orphan");
  });

  it("merges parts from several services", () => {
    const a = span({ category: "http.server", service: "a" });
    const b = span({ category: "http.server", service: "b", parentSpanId: a.spanId });
    const p1 = buildTrace("t", [a], [], ["http://b/_wizelens"]);
    const p2 = buildTrace("t", [b, a], [], []);
    const merged = mergeTraces("t", [p1, p2]);
    expect(merged.spanCount).toBe(2);
    expect(merged.services).toEqual(["a", "b"]);
    expect(merged.remotes).toEqual(["http://b/_wizelens"]);
    expect(merged.service).toBe("a");
  });
});
