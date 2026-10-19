import { describe, expect, it, vi } from "vitest";
import { ATTR_ERROR_FRAME, ATTR_SERVICE_VERSION } from "../attributes.js";
import { errorEvents, errorGroups } from "../stats/errors.js";
import { CART_MAP, CART_MINIFIED, CART_STACK, CART_URL, cartLoader } from "../testing/sourcemap.js";
import type { Span, Trace } from "../types.js";
import { annotateErrorFrames } from "./annotate.js";
import { cachedLoader, chainLoaders, decodeDataUrl, fetchMapLoader, isLoopbackUrl, mapUrlOf } from "./loaders.js";

const allowAll = () => true;
const respond = (files: Record<string, string>) =>
  vi.fn(async (url: string | URL | Request) => {
    const body = files[String(url)];
    return body === undefined ? new Response("missing", { status: 404 }) : new Response(body);
  }) as unknown as typeof fetch;

describe("fetchMapLoader", () => {
  it("follows sourceMappingURL, then falls back to <script>.map", async () => {
    const named = fetchMapLoader({ allow: allowAll, fetch: respond({ [CART_URL]: `${CART_MINIFIED}\n//# sourceMappingURL=maps/a.js.map`, "https://app.test/assets/maps/a.js.map": CART_MAP }) });
    expect((await named(CART_URL, null))?.sources).toEqual(["../../src/cart.ts"]);
    const hidden = fetchMapLoader({ allow: allowAll, fetch: respond({ [CART_URL]: CART_MINIFIED, [`${CART_URL}.map`]: CART_MAP }) });
    expect(await hidden(CART_URL, null)).not.toBeNull();
  });

  it("reads inline data URLs, as Vite's dev server sends", async () => {
    const inline = `${CART_MINIFIED}\n//# sourceMappingURL=data:application/json;base64,${btoa(CART_MAP)}`;
    const load = fetchMapLoader({ allow: allowAll, fetch: respond({ [CART_URL]: inline }) });
    expect((await load(CART_URL, null))?.names).toEqual(["Error"]);
    expect(decodeDataUrl("data:application/json,%7B%7D")).toBe("{}");
  });

  it("fetches only allowed URLs: loopback by default", async () => {
    const fetchFn = respond({});
    expect(await fetchMapLoader({ fetch: fetchFn })(CART_URL, null)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(isLoopbackUrl(new URL("http://localhost:5173/x.js"))).toBe(true);
    expect(isLoopbackUrl(new URL("http://127.0.0.1/x.js"))).toBe(true);
    expect(isLoopbackUrl(new URL("http://example.com/x.js"))).toBe(false);
    expect(mapUrlOf("x\n//# sourceMappingURL=a.map\n//# sourceMappingURL=b.map")).toBe("b.map");
  });
});

describe("chain and cache", () => {
  it("takes the first map found, and keeps hits and short-lived misses", async () => {
    let t = 0;
    const miss = vi.fn(async () => null);
    const hit = vi.fn(cartLoader);
    const load = cachedLoader(chainLoaders(miss, hit), { missMs: 100, now: () => t });
    expect(await load(CART_URL, "1")).not.toBeNull();
    expect(await load(CART_URL, "1")).not.toBeNull();
    expect(hit).toHaveBeenCalledTimes(1);
    expect(await load("https://app.test/other.js", "1")).toBeNull();
    await load("https://app.test/other.js", "1");
    expect(miss).toHaveBeenCalledTimes(2);
    t = 200;
    await load("https://app.test/other.js", "1");
    expect(miss).toHaveBeenCalledTimes(3);
  });
});

function browserError(stack: string, spanId: string): Span {
  return {
    traceId: "a".repeat(32),
    spanId,
    parentSpanId: null,
    name: "Error: Coupon code is empty",
    kind: "internal",
    category: "browser",
    service: "browser",
    startMs: 1000,
    durationMs: 0,
    status: "error",
    statusMessage: "Coupon code is empty",
    attributes: { "wizelens.browser.type": "error", [ATTR_SERVICE_VERSION]: "1.0.0" },
    events: [{ name: "exception", timeMs: 1000, attributes: { "exception.type": "Error", "exception.message": "Coupon code is empty", "exception.stacktrace": stack } }],
  };
}

describe("annotateErrorFrames and grouping", () => {
  it("adds the group frame, and errors with it group apart from the same message elsewhere", async () => {
    const spans = [browserError(CART_STACK, "1".repeat(16)), browserError("Error: Coupon code is empty\n    at x (https://app.test/other.js:1:1)", "2".repeat(16))];
    await annotateErrorFrames(spans, cartLoader);
    expect(spans[0]!.events[0]!.attributes[ATTR_ERROR_FRAME]).toBe("src/cart.ts:applyCoupon");
    expect(spans[1]!.events[0]!.attributes[ATTR_ERROR_FRAME]).toBeUndefined();
    const trace = { traceId: "a".repeat(32), spans, logs: [], remotes: [] } as unknown as Trace;
    const events = errorEvents([trace]);
    expect(events.map((e) => e.key).sort()).toEqual(["Web App|Error|Coupon code is empty", "Web App|Error|Coupon code is empty|src/cart.ts:applyCoupon"]);
    expect(events[0]!.release).toBe("1.0.0");
    expect(errorGroups(events)).toHaveLength(2);
  });

  it("does not wait past its time limit", async () => {
    const spans = [browserError(CART_STACK, "1".repeat(16))];
    await annotateErrorFrames(spans, () => new Promise(() => {}), 10);
    expect(spans[0]!.events[0]!.attributes[ATTR_ERROR_FRAME]).toBeUndefined();
  });
});
