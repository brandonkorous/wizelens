import { describe, expect, it } from "vitest";
import { makeRequest } from "../testing/fixtures.js";
import { component, makePageView } from "../testing/pageviews.js";
import { insightGroups } from "./insights.js";
import { componentIssues, componentRows, pageViews, renderInsightGroups, renderPhases, routeIssues, routeRows } from "./rendering.js";

describe("page views and routes", () => {
  it("reads page view timings and skips other spans", () => {
    const views = pageViews([makePageView({ route: "/products/{}", page: { renderMs: 300, ssrMs: 90, lcpMs: 1200, cls: 0.02 } }), makeRequest()]);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ route: "/products/{}", navigation: "load", renderMs: 300, ssrMs: 90, lcpMs: 1200, cls: 0.02, hydrationMs: null });
  });

  it("averages per route and rates issues", () => {
    const views = pageViews([
      makePageView({ route: "/", page: { renderMs: 100, lcpMs: 1000, cls: 0.01 } }),
      makePageView({ route: "/checkout", page: { renderMs: 1400, lcpMs: 5000, cls: 0.3 } }),
      makePageView({ route: "/checkout", page: { renderMs: 1200, lcpMs: 4600, cls: 0.3 } }),
      makePageView({ route: "/cart", page: { renderMs: 200, largeImages: 2 } }),
    ]);
    const rows = routeRows(views);
    expect(rows[0]).toMatchObject({ route: "/checkout", views: 2, avgRenderMs: 1300, issue: "high" });
    expect(rows.find((r) => r.route === "/")?.issue).toBe("none");
    expect(rows.find((r) => r.route === "/cart")).toMatchObject({ issue: "minor", issues: ["Large images without lazy loading"] });
  });

  it("flags server render that takes a large share", () => {
    expect(routeIssues({ avgRenderMs: 600, avgSsrMs: 300, avgLcpMs: null, avgCls: null, largeImages: 0 }).issues).toEqual(["Server render is 50% of render time"]);
  });

  it("computes phase averages and p75", () => {
    const views = pageViews([10, 20, 30, 40].map((h) => makePageView({ page: { hydrationMs: h, cls: h / 100 } })));
    const avg = renderPhases(views, "avg");
    expect(avg.find((p) => p.key === "hydration")?.value).toBe(25);
    expect(avg.find((p) => p.key === "ssr")?.value).toBeNull();
    expect(renderPhases(views, "p75").find((p) => p.key === "hydration")?.value).toBe(30);
  });
});

describe("components", () => {
  it("sums component stats and finds issues", () => {
    const traces = [
      makePageView({ components: [component("ProductCard", { renders: 30, actualMs: 120, selfMs: 60, wasted: 12 })] }),
      makePageView({ components: [component("ProductCard", { renders: 20, actualMs: 80, selfMs: 40, wasted: 8 }), component("Header", { renders: 2, actualMs: 2 })] }),
    ];
    const rows = componentRows(traces, 2);
    expect(rows[0]).toMatchObject({ name: "ProductCard", renders: 50, totalMs: 200, selfMs: 100, avgMs: 4, impact: "high" });
    expect(rows[0]!.issues).toEqual(["Re-renders frequently", "Re-renders with the same props"]);
    expect(rows[1]).toMatchObject({ name: "Header", issues: [], impact: "low" });
  });

  it("skips bad JSON", () => {
    expect(componentRows([makePageView({ components: "{not json" })], 1)).toEqual([]);
  });

  it("detects context and slow renders", () => {
    expect(componentIssues({ renders: 10, actualMs: 200, wasted: 0, context: 6 }, 10)).toEqual(["Context value changes often", "Slow render"]);
  });
});

describe("render insights", () => {
  it("turns route and component problems into insights", () => {
    const traces = [
      makePageView({ route: "/checkout", page: { renderMs: 1500, lcpMs: 5000 } }),
      makePageView({ components: [component("Gallery", { renders: 4, actualMs: 100 })] }),
    ];
    const groups = renderInsightGroups(traces);
    expect(groups.map((g) => g.key)).toEqual(["render|route|/checkout", "render|component|Gallery"]);
    expect(groups[0]).toMatchObject({ area: "render", kind: "render", impact: "high", title: "Render bottleneck" });
    expect(insightGroups(traces).some((g) => g.area === "render")).toBe(true);
  });
});
