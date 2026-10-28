import { describe, expect, it } from "vitest";
import { memoryExecutor } from "../scale/memory.js";
import { pageContext } from "../scale/run.js";
import { makePageView } from "../testing/pageviews.js";
import { runPageSync } from "./index.js";
import { slowCauseOf } from "./route-devices.js";

const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const NOW = 1_700_000_600_000;
const none = { imageMs: null, largeImages: null };

describe("one route on each device", () => {
  it("names the biggest stretch of a load", () => {
    expect(slowCauseOf({ ttfbMs: 3000, fcpMs: 3400, readyMs: 3600, ...none })).toBe("host");
    expect(slowCauseOf({ ttfbMs: 100, fcpMs: 3000, readyMs: 3200, ...none })).toBe("code");
    expect(slowCauseOf({ ttfbMs: 100, fcpMs: 1500, readyMs: 6100, ...none })).toBe("content");
    expect(slowCauseOf({ ttfbMs: 100, fcpMs: 1500, readyMs: 6100, imageMs: 3000, largeImages: 0 })).toBe("images");
    expect(slowCauseOf({ ttfbMs: 100, fcpMs: 1500, readyMs: 6100, imageMs: 200, largeImages: 2 })).toBe("images");
    expect(slowCauseOf({ ttfbMs: null, fcpMs: 1500, readyMs: 6100, ...none })).toBeNull();
  });

  it("gives the route's phases per device, phones first", () => {
    const at = (i: number) => NOW - 60_000 + i;
    const route = "/blog/devsecops";
    const traces = [
      makePageView({ startMs: at(1), route, userAgent: WINDOWS, page: { renderMs: 1200, ttfbMs: 20, fcpMs: 400 } }),
      makePageView({ startMs: at(2), route, userAgent: PIXEL, page: { renderMs: 6000, ttfbMs: 100, fcpMs: 1400, imageMs: 4000, largeImages: 2 } }),
      makePageView({ startMs: at(3), route, userAgent: PIXEL, page: { renderMs: 6200, ttfbMs: 300, fcpMs: 1600, imageMs: 4400, largeImages: 2 } }),
      makePageView({ startMs: at(4), route: "/", userAgent: PIXEL, page: { renderMs: 100, ttfbMs: 1, fcpMs: 50 } }),
    ];
    const m = runPageSync("route", pageContext("1h", NOW, { route: "app.test/blog/devsecops" }), memoryExecutor(traces)).devices;
    expect(m.map((d) => [d.device, d.views])).toEqual([["Phone", 2], ["Desktop", 1]]);
    expect(m[0]).toMatchObject({ ttfbMs: 200, fcpMs: 1500, readyMs: 6100, imageMs: 4200, largeImages: 2, cause: "images" });
    expect(m[1]).toMatchObject({ ttfbMs: 20, fcpMs: 400, readyMs: 1200, cause: "content" });
  });
});
