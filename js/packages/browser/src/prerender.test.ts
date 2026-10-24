import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchErrors } from "./errors.js";
import { newPageView, pageViewAttributes } from "./pageview.js";
import { stubPage } from "./test-env.js";

beforeEach(stubPage);
afterEach(() => vi.unstubAllGlobals());

const IMAGES = { slowestMs: 0, count: 0, large: 0 };

describe("prerendered pages", () => {
  it("count their times from when the page was shown, not from the prerender", () => {
    const nav = { startTime: 0, requestStart: 20, responseStart: 120, responseEnd: 150, loadEventEnd: 900, activationStart: 2000 };
    const view = { ...newPageView("load", 0), fcpMs: 400, lcpMs: 2500 };
    expect(pageViewAttributes(view, nav, IMAGES)).toMatchObject({
      "wizelens.page.prerendered": true,
      "wizelens.page.ttfb_ms": 0,
      "wizelens.page.fcp_ms": 0,
      "wizelens.page.lcp_ms": 500,
      "wizelens.page.render_ms": 500,
      "wizelens.page.load_ms": 0,
    });
  });

  it("send no errors while the page is still prerendering", () => {
    const seen: string[] = [];
    const page = new EventTarget();
    vi.stubGlobal("addEventListener", page.addEventListener.bind(page));
    vi.stubGlobal("removeEventListener", page.removeEventListener.bind(page));
    const fire = (message: string) => page.dispatchEvent(Object.assign(new Event("error"), { error: new Error(message) }));
    const stop = watchErrors((e) => seen.push(e.message));
    vi.stubGlobal("document", { prerendering: true });
    fire("ahead of time");
    vi.stubGlobal("document", { prerendering: false });
    fire("after it was shown");
    stop();
    expect(seen).toEqual(["after it was shown"]);
  });
});
