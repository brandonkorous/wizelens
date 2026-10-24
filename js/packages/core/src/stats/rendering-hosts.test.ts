import { describe, expect, it } from "vitest";
import { renderFacts } from "../scale/facts-render.js";
import { makeRequest } from "../testing/fixtures.js";
import { makePageView } from "../testing/pageviews.js";
import { buildTrace } from "../trace.js";
import { pageViews, routeRows } from "./rendering.js";

describe("render routes", () => {
  it("keeps the same route on two sites apart", () => {
    const a = makePageView({ route: "/" });
    const b = makePageView({ route: "/" });
    b.spans[0]!.attributes["url.full"] = "https://meetpiggles.com/";
    expect(routeRows(pageViews([a, b])).map((r) => r.route).sort()).toEqual(["app.test/", "meetpiggles.com/"]);
  });

  it("leaves out a page a bot's renderer loaded", () => {
    const view = makePageView({ route: "/tools/x", page: { renderMs: 6000 } });
    const server = makeRequest({ attributes: { "user_agent.original": "Mozilla/5.0 (compatible; bingbot/2.0)" } }).spans[0]!;
    const t = buildTrace(view.traceId, [{ ...server, traceId: view.traceId }, ...view.spans], [], []);
    expect(pageViews([t])).toEqual([]);
    expect(renderFacts(t)).toEqual([]);
  });
});
