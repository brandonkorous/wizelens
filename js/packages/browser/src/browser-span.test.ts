import { afterEach, describe, expect, it } from "vitest";
import { ATTR_BROWSER_APP, VERSION_ATTR } from "@wizeworks/lens-core";
import { browserSpan, isBotBrowser, setBrowserApp, setBrowserRelease } from "./browser-span.js";
import { scriptOptions } from "./script.js";

const input = { traceId: "a".repeat(32), spanId: "1".repeat(16), parentSpanId: null, name: "GET /", type: "fetch" as const, sessionId: "s", route: "/", startMs: 0, durationMs: 5 };

afterEach(() => {
  setBrowserRelease(undefined);
  setBrowserApp(undefined);
});

describe("browser spans", () => {
  it("carry the web app's release when one is set", () => {
    expect(browserSpan(input).attributes[VERSION_ATTR]).toBeUndefined();
    setBrowserRelease(" 7.0.1 ");
    expect(browserSpan(input).attributes[VERSION_ATTR]).toBe("7.0.1");
  });

  it("carry the web app's name when one is set, from the option or the tag's data-service", () => {
    expect(browserSpan(input).attributes[ATTR_BROWSER_APP]).toBeUndefined();
    setBrowserApp(" piggles-web ");
    expect(browserSpan(input).attributes[ATTR_BROWSER_APP]).toBe("piggles-web");
    const attrs: Record<string, string> = { "data-endpoint": "/_wizelens", "data-service": "api (browser)" };
    const tag = { getAttribute: (n: string) => attrs[n] ?? null };
    expect(scriptOptions(tag)).toMatchObject({ service: "api (browser)" });
  });

  it("know a crawler's renderer and a driven browser", () => {
    expect(isBotBrowser({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1) Chrome/130.0 Safari/537.36" })).toBe(true);
    expect(isBotBrowser({ userAgent: "Mozilla/5.0 Chrome/155.0 Safari/537.36", webdriver: true })).toBe(true);
    expect(isBotBrowser({ userAgent: "Mozilla/5.0 Chrome/155.0 Safari/537.36" })).toBe(false);
  });
});
