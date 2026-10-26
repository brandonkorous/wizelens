import { describe, expect, it } from "vitest";
import { errorEvents } from "./stats/errors.js";
import { makeSpan } from "./testing/fixtures.js";
import { buildTrace } from "./trace.js";
import type { Span } from "./types.js";

// The exact message of trace 175a94d02ed801564231caf7908b0ff8 (WizeWorks site, Next 16.4.3).
const NEXT = "/app/node_modules/.pnpm/next@16.4.3_@opentelemetry+api@1.9.1_@playwright+test@1.60.0_@types+node@25.9.1_react-dom@19._h27gfw6buenj7ykvwwg2wqkkzm/node_modules/next/dist/server";
const MESSAGE = [
  "Cannot find module '/app/wizeworks/apps/site/.next/server/app-edge-has-no-entrypoint'",
  "Require stack:",
  `- ${NEXT}/require.js`,
  `- ${NEXT}/next-server.js`,
  `- ${NEXT}/next.js`,
  "- /app/wizeworks/apps/site/server.js",
].join("\n");

const T = "1".repeat(32);

const loadRouteModule = (message: string, parentSpanId: string | null = null): Span =>
  makeSpan({
    traceId: T,
    parentSpanId,
    category: "internal",
    service: "site",
    name: "load route module",
    status: "error",
    statusMessage: message,
    attributes: { "next.span_category": "nextjs", "next.span_name": "load route module", "next.span_type": "LoadComponents.loadRouteModule", "error.type": "Error" },
    events: [{ name: "exception", timeMs: 1, attributes: { "exception.type": "MODULE_NOT_FOUND", "exception.message": message } }],
  });

describe("Next.js preload of edge routes", () => {
  it("is not an error: Next ignores the missing placeholder module on purpose", () => {
    const t = buildTrace(T, [loadRouteModule(MESSAGE)], [], []);
    expect(t.spans[0]).toMatchObject({ status: "unset", statusMessage: null, events: [] });
    expect(t.errorCount).toBe(0);
    expect(t.status).not.toBe("error");
    expect(errorEvents([t])).toEqual([]);
  });

  it("stays an error for another missing module, or inside a request", () => {
    const other = buildTrace(T, [loadRouteModule("Cannot find module './orders'")], [], []);
    expect(errorEvents([other])).toHaveLength(1);
    const inRequest = buildTrace(T, [loadRouteModule(MESSAGE, "a".repeat(16))], [], []);
    expect(errorEvents([inRequest])).toHaveLength(1);
  });
});
