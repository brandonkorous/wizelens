import { describe, expect, it } from "vitest";
import { analyzeTrace, ATTR_BROWSER_ROUTE, ATTR_BROWSER_TYPE, ATTR_PAGE, buildTrace, requestRows } from "./index.js";
import { insightHits } from "./stats/insights.js";
import { makeSpan } from "./testing/fixtures.js";

const T = "6".repeat(32);
const view = (renderMs: number, largeImages = 0) =>
  makeSpan({ traceId: T, category: "browser", service: "browser", startMs: 1_700_000_000_000, durationMs: renderMs, name: "pageview /blog", attributes: { [ATTR_BROWSER_TYPE]: "pageview", [ATTR_BROWSER_ROUTE]: "/blog", [ATTR_PAGE.renderMs]: renderMs, [ATTR_PAGE.largeImages]: largeImages } });

describe("a slow page view", () => {
  it("is a problem of its trace once the main content shows after 2.5 s", () => {
    expect(analyzeTrace(buildTrace(T, [view(2400)], [], []))).toEqual([]);
    expect(analyzeTrace(buildTrace(T, [view(3000)], [], []))).toMatchObject([{ kind: "slow-page", severity: "info", shape: "/blog" }]);
    const [f] = analyzeTrace(buildTrace(T, [view(6140, 1)], [], []));
    expect(f).toMatchObject({ kind: "slow-page", severity: "warning", title: "Slow page: the main content showed at 6.14 s; 1 picture is bigger than the screen needs", totalMs: 6140 });
  });

  it("is not a request insight: Rendering has it per route", () => {
    for (const r of requestRows([buildTrace(T, [view(6140)], [], [])])) expect(insightHits(r)).toEqual([]);
  });
});
