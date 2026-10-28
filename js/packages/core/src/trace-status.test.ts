import { expect, it } from "vitest";
import { makeRequest, makeSpan } from "./testing/fixtures.js";
import { buildTrace } from "./trace.js";

it("reads a page load's status from its server span, under the browser's page view", () => {
  const page = makeRequest({ path: "/Basket", route: "/Basket/{handler?}", status: 500 });
  const server = page.spans[0]!;
  const view = makeSpan({ traceId: page.traceId, spanId: "aaaaaaaaaaaaaaaa", category: "browser", service: "browser", name: "pageview /Basket", startMs: server.startMs - 5 });
  server.parentSpanId = view.spanId;
  const trace = buildTrace(page.traceId, [view, server], [], []);
  expect(trace.rootName).toBe("pageview /Basket");
  expect(trace.rootStatusCode).toBe(500);
  expect(buildTrace(page.traceId, [view], [], []).rootStatusCode).toBeNull();
});
