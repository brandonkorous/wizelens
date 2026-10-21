import { afterEach, describe, expect, it, vi } from "vitest";
import { TIMING_TRACE } from "@wizeworks/lens-core";
import { documentRequest } from "./document-request.js";

const TRACE = "0af7651916cd43dd8448eb211c80319c";

function stubNavigation(serverTiming: { name: string; description: string }[], paint?: number): void {
  const nav = { startTime: 0, responseStart: 42, domContentLoadedEventEnd: 90, responseStatus: 200, serverTiming };
  vi.stubGlobal("location", new URL("http://app.test/orders?page=2"));
  vi.stubGlobal("performance", {
    timeOrigin: 1_700_000_000_000,
    getEntriesByType: (t: string) => (t === "navigation" ? [nav] : []),
    getEntriesByName: (n: string) => (n === "first-contentful-paint" && paint !== undefined ? [{ startTime: paint }] : []),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("documentRequest", () => {
  it("makes the page's own request a HUD row when a WizeLens server traced it", () => {
    stubNavigation([{ name: TIMING_TRACE, description: TRACE }], 70);
    expect(documentRequest()).toMatchObject({
      method: "GET",
      path: "/orders?page=2",
      status: 200,
      durationMs: 42,
      renderMs: 28,
      traceId: TRACE,
      profiled: true,
      startMs: 1_700_000_000_000,
    });
  });

  it("uses DOMContentLoaded when the page has not painted yet", () => {
    stubNavigation([{ name: TIMING_TRACE, description: TRACE }]);
    expect(documentRequest()?.renderMs).toBe(48);
  });

  it("gives nothing for a page no WizeLens server traced", () => {
    stubNavigation([]);
    expect(documentRequest()).toBeNull();
  });
});
