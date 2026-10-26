import { describe, expect, it } from "vitest";
import { ATTR_BROWSER_PREFETCH, ATTR_BROWSER_TYPE, isWebAppCall } from "./attributes.js";
import { errorEvents } from "./stats/errors.js";
import { makeSpan } from "./testing/fixtures.js";
import { buildTrace } from "./trace.js";

// A footer prefetch as browser SDK 0.3.0-alpha.11 sent it (kanninja.com, trace b08c7658508bf6df6439f9b822b01fbf).
const oldFetch = (url: string) =>
  makeSpan({
    traceId: "b".repeat(32),
    category: "browser",
    kind: "client",
    service: "browser",
    name: `fetch ${new URL(url).pathname}`,
    status: "error",
    statusMessage: "Failed to fetch",
    attributes: { [ATTR_BROWSER_TYPE]: "fetch", "url.full": url, "http.request.method": "GET", "http.response.status_code": null },
    events: [{ name: "exception", timeMs: 1, attributes: { "exception.type": "FetchError", "exception.message": "Failed to fetch" } }],
  });

describe("router prefetches from older browser SDKs", () => {
  it("are prefetches, not failed calls or errors", () => {
    const t = buildTrace("b".repeat(32), [oldFetch("https://kanninja.com/aup?_rsc=SCJVgjZa56qhWaZb")], [], []);
    const s = t.spans[0]!;
    expect(s).toMatchObject({ status: "unset", statusMessage: null, events: [] });
    expect(s.attributes[ATTR_BROWSER_PREFETCH]).toBe(true);
    expect(isWebAppCall(s)).toBe(false);
    expect(t.errorCount).toBe(0);
    expect(errorEvents([t])).toEqual([]);
  });

  it("leave a real failed fetch an error", () => {
    const t = buildTrace("b".repeat(32), [oldFetch("https://kanninja.com/api/boards?rsc=1")], [], []);
    expect(t.errorCount).toBe(1);
    expect(errorEvents([t])).toHaveLength(1);
  });
});
