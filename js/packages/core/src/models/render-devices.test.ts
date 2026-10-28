import { describe, expect, it } from "vitest";
import { memoryExecutor } from "../scale/memory.js";
import { pageContext } from "../scale/run.js";
import { makePageView } from "../testing/pageviews.js";
import { deviceOf } from "../user-agent.js";
import { runPageSync } from "./index.js";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const PIXEL_TAB = "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const NOW = 1_700_000_600_000;

describe("page views by device", () => {
  it("names the device of a user agent", () => {
    expect([IPHONE, PIXEL, IPAD, PIXEL_TAB, WINDOWS, ""].map(deviceOf)).toEqual(["Phone", "Phone", "Tablet", "Tablet", "Desktop", null]);
  });

  it("gives each page its views and render time per device, phones first", () => {
    const at = (i: number) => NOW - 60_000 + i;
    const traces = [
      makePageView({ startMs: at(1), route: "/contact", userAgent: IPHONE, page: { renderMs: 900 } }),
      makePageView({ startMs: at(2), route: "/contact", userAgent: IPHONE, page: { renderMs: 1100 } }),
      makePageView({ startMs: at(3), route: "/contact", userAgent: WINDOWS, page: { renderMs: 200 } }),
      makePageView({ startMs: at(4), route: "/", userAgent: WINDOWS, page: { renderMs: 100 } }),
      makePageView({ startMs: at(5), route: "/", userAgent: IPAD, page: { renderMs: 300 } }),
      makePageView({ startMs: at(6), route: "/", page: { renderMs: 50 } }),
    ];
    const m = runPageSync("rendering", pageContext("1h", NOW, {}), memoryExecutor(traces)).devices;
    expect(m.routes.map((r) => r.route)).toEqual(["app.test/contact", "app.test/"]);
    expect(m.routes[0]!.cells).toEqual({ Phone: { views: 2, avgMs: 1000, p75Ms: expect.any(Number) }, Tablet: null, Desktop: { views: 1, avgMs: 200, p75Ms: expect.any(Number) } });
    expect([m.all.cells.Phone?.views, m.all.cells.Tablet?.views, m.all.cells.Desktop?.views]).toEqual([2, 1, 2]);
    expect(m.all.cells.Desktop?.avgMs).toBe(150);
  });
});
