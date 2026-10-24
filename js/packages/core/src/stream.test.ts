import { describe, expect, it } from "vitest";
import { ATTR_REQUEST_ABORTED, ATTR_STREAM, ATTR_STREAM_FIRST_BYTE_MS, buildTrace, isStreamSpan, requestRows, runPageSync, serviceRows, type Span, type Trace } from "./index.js";
import { memoryExecutor } from "./scale/memory.js";
import { pageContext } from "./scale/run.js";
import { makeSpan } from "./testing/fixtures.js";

const NOW = 1_800_000_000_000;

function request(i: number, durationMs: number, attributes: Span["attributes"] = {}): Trace {
  const traceId = String(i).padStart(32, "a");
  const route = attributes[ATTR_STREAM] ? "/mcp" : "/api/items";
  const span = makeSpan({
    traceId, category: "http.server", kind: "server", service: "mcp-site", name: `GET ${route}`, startMs: NOW - 3_600_000 + i * 1000, durationMs,
    attributes: { "http.request.method": "GET", "url.path": route, "http.route": route, "http.response.status_code": 200, ...attributes },
  });
  return buildTrace(traceId, [span], [], []);
}

const traces = [request(0, 300_000, { [ATTR_STREAM]: true, [ATTR_STREAM_FIRST_BYTE_MS]: 50, [ATTR_REQUEST_ABORTED]: true }), ...Array.from({ length: 10 }, (_, i) => request(i + 1, 50))];

describe("streams", () => {
  it("count a 300 s SSE stream by its first byte: avg stays about 50 ms, the service is healthy", () => {
    const row = serviceRows(traces).find((r) => r.key === "api:mcp-site")!;
    expect(row).toMatchObject({ requests: 11, status: "healthy" });
    expect(row.avgMs).toBeCloseTo(50, 6);
    const stream = requestRows([traces[0]!])[0]!;
    expect(stream).toMatchObject({ durationMs: 50, aborted: false, health: "success" });
  });

  it("show on the Service and Endpoint pages as a Streams figure, from the stats tables", () => {
    const ex = memoryExecutor(traces);
    const svc = runPageSync("service", pageContext("24h", NOW, { service: "api:mcp-site" }), ex);
    expect(svc.row).toMatchObject({ requests: 11, status: "healthy" });
    expect(svc.row!.avgMs!).toBeLessThan(60);
    expect(svc.streams).toMatchObject({ count: 1, avgOpenMs: 300_000 });
    const ep = runPageSync("endpoint", pageContext("24h", NOW, { service: "api:mcp-site", endpoint: "GET /mcp" }), ex);
    expect(ep.streams?.count).toBe(1);
    expect(ep.totals!.avgMs!).toBeLessThan(60);
  });

  it("are found by mark, content type, or a 101 upgrade", () => {
    const span = (attributes: Span["attributes"]) => makeSpan({ category: "http.server", attributes });
    expect(isStreamSpan(span({ "http.response.header.content-type": "text/event-stream; charset=utf-8" }))).toBe(true);
    expect(isStreamSpan(span({ "http.response.status_code": 101 }))).toBe(true);
    expect(isStreamSpan(span({ "http.response.status_code": 200 }))).toBe(false);
  });
});
