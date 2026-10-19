import { afterEach, describe, expect, it } from "vitest";
import { VERSION_ATTR } from "@wizeworks/lens-core";
import { browserSpan, setBrowserRelease } from "./browser-span.js";

const input = { traceId: "a".repeat(32), spanId: "1".repeat(16), parentSpanId: null, name: "GET /", type: "fetch" as const, sessionId: "s", route: "/", startMs: 0, durationMs: 5 };

afterEach(() => setBrowserRelease(undefined));

describe("browser spans", () => {
  it("carry the web app's release when one is set", () => {
    expect(browserSpan(input).attributes[VERSION_ATTR]).toBeUndefined();
    setBrowserRelease(" 7.0.1 ");
    expect(browserSpan(input).attributes[VERSION_ATTR]).toBe("7.0.1");
  });
});
