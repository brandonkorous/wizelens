import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCaptureHandle } from "./capture.js";
import { currentRoute } from "./browser-span.js";
import { errorSpan, toCapturedError } from "./errors.js";
import { isOversized } from "./images.js";
import { newPageView, pageViewAttributes, pageViewSpan } from "./pageview.js";
import { stubPage } from "./test-env.js";

beforeEach(stubPage);

const NAV = { startTime: 0, requestStart: 20, responseStart: 120, responseEnd: 150, loadEventEnd: 900 };
const IMAGES = { slowestMs: 42.04, count: 3, large: 1 };

describe("page views", () => {
  it("gives a full load its navigation timings and render time", () => {
    const view = { ...newPageView("load", 0), fcpMs: 300, lcpMs: 640, inpMs: 80, hydrationMs: 12.34 };
    view.shifts.push({ startTime: 10, value: 0.05 }, { startTime: 20, value: 0.02 });
    expect(pageViewAttributes(view, NAV, IMAGES)).toMatchObject({
      "wizelens.browser.navigation": "load",
      "wizelens.page.ttfb_ms": 120,
      "wizelens.page.ssr_ms": 100,
      "wizelens.page.client_render_ms": 150,
      "wizelens.page.load_ms": 900,
      "wizelens.page.lcp_ms": 640,
      "wizelens.page.render_ms": 640,
      "wizelens.page.cls": 0.07,
      "wizelens.page.hydration_ms": 12.3,
      "wizelens.page.image_ms": 42,
      "wizelens.page.images": 3,
      "wizelens.page.large_images": 1,
    });
  });

  it("falls back to the load event without LCP, and leaves out unknown values", () => {
    const attrs = pageViewAttributes(newPageView("load", 0), NAV, { slowestMs: null, count: 0, large: 0 });
    expect(attrs["wizelens.page.render_ms"]).toBe(900);
    expect(attrs).not.toHaveProperty("wizelens.page.lcp_ms");
    expect(attrs).not.toHaveProperty("wizelens.page.image_ms");
  });

  it("gives a route change its own trace and render time, without load timings", () => {
    const view = { ...newPageView("spa", 2000), renderMs: 35 };
    const span = pageViewSpan(view, NAV, IMAGES, "s1");
    expect(span).toMatchObject({ name: "pageview /page", durationMs: 35, category: "browser", parentSpanId: null });
    expect(span.traceId).not.toBe(newPageView("spa", 0).traceId);
    expect(span.attributes).toMatchObject({ "wizelens.browser.type": "pageview", "wizelens.browser.navigation": "spa", "wizelens.browser.session": "s1" });
    expect(span.attributes).not.toHaveProperty("wizelens.page.ssr_ms");
  });

  it("shapes routes and finds images that are too big", () => {
    vi.stubGlobal("location", new URL("http://app.test/products/123?x=1"));
    expect(currentRoute()).toBe("/products/{}");
    expect(isOversized({ naturalWidth: 2400, naturalHeight: 1600, clientWidth: 300, clientHeight: 200 })).toBe(true);
    expect(isOversized({ naturalWidth: 2400, naturalHeight: 1600, clientWidth: 300, clientHeight: 200, loading: "lazy" })).toBe(false);
    expect(isOversized({ naturalWidth: 600, naturalHeight: 400, clientWidth: 300, clientHeight: 200 })).toBe(false);
  });
});

describe("browser errors", () => {
  it("normalizes what was thrown and puts it in the page view's trace", () => {
    expect(toCapturedError("boom")).toEqual({ type: "Error", message: "boom", stack: null });
    expect(toCapturedError({ code: 7 })).toMatchObject({ message: '{"code":7}' });
    const err = toCapturedError(new TypeError("x is undefined"));
    const view = newPageView("load", 0);
    const span = errorSpan(view, err, "s1");
    expect(span).toMatchObject({ traceId: view.traceId, parentSpanId: view.spanId, status: "error", name: "TypeError: x is undefined" });
    expect(span.attributes["wizelens.browser.type"]).toBe("error");
    expect(span.events[0]!.attributes).toMatchObject({ "exception.type": "TypeError", "exception.message": "x is undefined" });
    expect(String(span.events[0]!.attributes["exception.stacktrace"])).toContain("TypeError");
  });
});

describe("capture handle", () => {
  it("keeps capture running through a quick stop and start", async () => {
    const stop = vi.fn();
    const start = vi.fn(() => stop);
    const handle = createCaptureHandle(start);
    handle.acquire();
    handle.release();
    handle.acquire();
    await new Promise((r) => setTimeout(r, 5));
    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    handle.release();
    await new Promise((r) => setTimeout(r, 5));
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
