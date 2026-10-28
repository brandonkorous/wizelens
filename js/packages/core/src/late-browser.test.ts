import { describe, expect, it } from "vitest";
import { ATTR_BROWSER_NAVIGATION, ATTR_BROWSER_TYPE, ATTR_PAGE, buildTrace, requestRows, type Span, traceTiming } from "./index.js";
import { makeSpan } from "./testing/fixtures.js";

const T = "5".repeat(32);
const HOUR = 3_600_000;

const server = (startMs: number): Span =>
  makeSpan({ traceId: T, category: "http.server", kind: "server", startMs, durationMs: 4, attributes: { "http.request.method": "GET", "url.path": "/", "http.response.status_code": 200 } });
const render = (startMs: number, parentSpanId: string): Span =>
  makeSpan({ traceId: T, category: "browser", service: "browser", startMs, durationMs: 3000, parentSpanId, attributes: { [ATTR_BROWSER_TYPE]: "react" } });

describe("late browser spans", () => {
  it("do not stretch a request: a 4 ms server span with a render 5 h later is a 4 ms request", () => {
    const root = server(1_700_000_000_000);
    const trace = buildTrace(T, [root, render(root.startMs + 5 * HOUR, root.spanId)], [], []);
    expect(trace.spans).toHaveLength(1);
    expect(requestRows([trace])[0]!.durationMs).toBe(4);
  });

  it("keep a render that follows its server answer closely", () => {
    const root = server(1_700_000_000_000);
    const trace = buildTrace(T, [root, render(root.startMs + 500, root.spanId)], [], []);
    expect(trace.spans).toHaveLength(2);
  });

  it("time a request without a browser call by its entry server span, not the whole trace", () => {
    const root = server(1_700_000_000_000);
    const late = makeSpan({ traceId: T, category: "internal", startMs: root.startMs + 60_000, durationMs: 10, parentSpanId: root.spanId });
    expect(traceTiming({ spans: [root, late], durationMs: 60_010 }).totalMs).toBe(4);
  });

  it("time a server page load as the HUD does: first paint, and render from the first byte to it", () => {
    const root = server(1_700_000_000_000);
    const view = makeSpan({ traceId: T, category: "browser", service: "browser", startMs: root.startMs - 5, durationMs: 85, attributes: { [ATTR_BROWSER_TYPE]: "pageview", [ATTR_BROWSER_NAVIGATION]: "load", [ATTR_PAGE.ttfbMs]: 11, [ATTR_PAGE.fcpMs]: 85 } });
    const timing = traceTiming({ spans: [view, root], durationMs: 85 });
    expect(timing).toMatchObject({ totalMs: 85, serverMs: 4, renderMs: 74 });
    const row = requestRows([buildTrace(T, [view, root], [], [])])[0]!;
    expect(row).toMatchObject({ durationMs: 85, renderMs: 74, networkMs: 7 });
  });

  it("time a page load with no server traced until its main content showed, as the lists do", () => {
    const attributes = { [ATTR_BROWSER_TYPE]: "pageview", [ATTR_BROWSER_NAVIGATION]: "load", [ATTR_PAGE.ttfbMs]: 2, [ATTR_PAGE.fcpMs]: 1560, [ATTR_PAGE.renderMs]: 6140 };
    const view = makeSpan({ traceId: T, category: "browser", service: "browser", startMs: 1_700_000_000_000, durationMs: 6140, attributes });
    expect(traceTiming({ spans: [view], durationMs: 6140 })).toMatchObject({ totalMs: 6140, serverMs: null, renderMs: 6138 });
  });
});
