import { describe, expect, it } from "vitest";
import { isNextControlFlow } from "./control-flow.js";
import { errorEvents } from "./stats/errors.js";
import { requestOf } from "./stats/requests.js";
import { makeRequest, makeSpan } from "./testing/fixtures.js";
import { buildTrace } from "./trace.js";

const notFound = (message: string, extra: Record<string, string> = {}) => {
  const page = makeRequest({ path: "/setup", route: "/[...slug]", status: 404 });
  const server = page.spans[0]!;
  const ex = { name: "exception", timeMs: server.startMs + 1, attributes: { "exception.type": "Error", "exception.message": message, ...extra } };
  const meta = makeSpan({ traceId: page.traceId, parentSpanId: server.spanId, category: "internal", service: "site", name: "generateMetadata /[...slug]/page", status: "error", statusMessage: message, events: [ex] });
  return buildTrace(page.traceId, [server, meta], [], []);
};

describe("framework control flow in stored traces", () => {
  it("knows Next.js signals by type, message, or digest, with or without an Error: head", () => {
    expect(["NEXT_HTTP_ERROR_FALLBACK;404", "Error: NEXT_HTTP_ERROR_FALLBACK;403", "NEXT_REDIRECT;replace;/x;307;", "NEXT_NOT_FOUND", "Internal: NoFallbackError"].every((n) => isNextControlFlow(n))).toBe(true);
    expect(isNextControlFlow("TypeError: x is undefined", "Error")).toBe(false);
  });

  it("does not count notFound() as an error or exception; the request counts by its 404", () => {
    for (const t of [notFound("NEXT_HTTP_ERROR_FALLBACK;404"), notFound("Error", { "exception.digest": "NEXT_HTTP_ERROR_FALLBACK;401" }), notFound("NEXT_REDIRECT;push;/login;307;")]) {
      expect(t.errorCount).toBe(0);
      expect(t.status).not.toBe("error");
      expect(errorEvents([t])).toEqual([]);
      expect(requestOf(t)).toMatchObject({ status: 404, errors: 0 });
    }
  });

  it("keeps real exceptions", () => {
    const t = notFound("Cannot read properties of undefined");
    expect(t.errorCount).toBe(1);
    expect(errorEvents([t])).toHaveLength(1);
  });
});
