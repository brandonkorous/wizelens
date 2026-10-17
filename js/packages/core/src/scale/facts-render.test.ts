import { describe, expect, it } from "vitest";
import { browserTypeOf } from "../attributes.js";
import { componentRows } from "../stats/rendering-components.js";
import { pageViews, renderPhases, routeIssues, routeRows } from "../stats/rendering.js";
import { requestOf } from "../stats/requests.js";
import { criticalSpans } from "../stats/traces.js";
import { logRows } from "../stats/logs.js";
import { traceListItem } from "../testing/legacy/traces.js";
import { relErr, sumKind, totalOf } from "../testing/scale-util.js";
import { scenarioTraces } from "../testing/scenario.js";
import { type Agg, avgOfAgg } from "./agg.js";
import { traceFacts } from "./facts.js";
import { histMax, histPercentile } from "./hist.js";
import { joinKey, KEY_SEP, splitKey } from "./kinds.js";

const traces = scenarioTraces();
const views = pageViews(traces);

describe("page view facts", () => {
  it("pv, pv.route, pv.m, and pv.large rebuild every route row", () => {
    expect(totalOf(traces, "pv").n).toBe(views.length);
    const routes = sumKind(traces, "pv.route");
    const m = sumKind(traces, "pv.m");
    const large = sumKind(traces, "pv.large");
    const avg = (route: string, measure: string) => {
      const a = m.get(joinKey(route, measure));
      return a ? avgOfAgg(a) : null;
    };
    for (const r of routeRows(views)) {
      const a = routes.get(r.route)!;
      expect([a.n, a.lastMs, (a.top as { traceId: string }).traceId]).toEqual([r.views, r.lastSeenMs, r.exampleTraceId]);
      const big = large.get(r.route);
      const numbers = { avgRenderMs: avg(r.route, "render"), avgSsrMs: avg(r.route, "ssr"), avgLcpMs: avg(r.route, "lcp"), avgCls: avg(r.route, "cls"), largeImages: Math.round(big ? (histMax(big.hist!) ?? 0) : 0), avgSsrRenderMs: avg(r.route, "ssrRender") };
      expect({ ...numbers, avgHydrationMs: avg(r.route, "hydration"), totalRenderMs: m.get(joinKey(r.route, "render"))?.sum ?? 0 }).toEqual({
        avgRenderMs: r.avgRenderMs, avgSsrMs: r.avgSsrMs, avgLcpMs: r.avgLcpMs, avgCls: r.avgCls, largeImages: r.largeImages,
        avgSsrRenderMs: numbers.avgSsrRenderMs, avgHydrationMs: r.avgHydrationMs, totalRenderMs: r.totalRenderMs,
      });
      expect(routeIssues(numbers)).toEqual({ issue: r.issue, issues: r.issues });
    }
  });

  it("pv.g gives the render phases", () => {
    const g = sumKind(traces, "pv.g");
    const key = { ssr: "ssr", client: "client", hydration: "hydration", images: "image", cls: "cls" } as Record<string, string>;
    const of = (k: string): Agg | undefined => g.get(key[k]!);
    for (const p of renderPhases(views, "avg")) expect(of(p.key) ? avgOfAgg(of(p.key)!) : null).toBeCloseTo(p.value ?? NaN, 6);
    for (const p of renderPhases(views, "p75")) expect(relErr(histPercentile(of(p.key)!.hist!, of(p.key)!.n, 75)!, p.value!)).toBeLessThanOrEqual(0.02);
  });
});

describe("React facts", () => {
  it("react and rc rebuild every component row", () => {
    const spans = traces.flatMap((t) => t.spans.filter((s) => browserTypeOf(s) === "react"));
    expect(totalOf(traces, "react").n).toBe(spans.length);
    const rc = sumKind(traces, "rc");
    const routes = sumKind(traces, "rc.route");
    const rows = componentRows(traces, views.length);
    expect(rc.size).toBe(rows.length);
    for (const r of rows) {
      const a = rc.get(r.name)!;
      expect(a.c.slice(0, 5).map((v) => Math.round(v * 1e6))).toEqual([r.renders, r.totalMs, r.selfMs, r.wasted, r.context].map((v) => Math.round(v * 1e6)));
      const names = [...routes.keys()].filter((k) => k.startsWith(r.name + KEY_SEP)).map((k) => splitKey(k)[1]!).sort();
      expect([names, a.lastMs, (a.top as { traceId: string }).traceId]).toEqual([r.routes, r.lastSeenMs, r.exampleTraceId]);
    }
  });
});

describe("list facts", () => {
  it("hold the request, trace, log, and critical rows of each trace", () => {
    for (const t of traces) {
      const f = traceFacts(t);
      const row = requestOf(t);
      expect(f.request).toEqual(row ? { ...row, findings: undefined } : null);
      expect(f.trace).toMatchObject({ ...traceListItem(t), startMs: t.startMs, spanCount: t.spanCount });
      expect(f.logs).toEqual(logRows([t]));
      expect(f.critical).toEqual(criticalSpans([t], 5));
    }
  });

  it("five critical spans per trace give the global top 25", () => {
    const top = traces.flatMap((t) => traceFacts(t).critical).sort((a, b) => b.durationMs - a.durationMs).slice(0, 25);
    expect(top.map((s) => s.durationMs)).toEqual(criticalSpans(traces, 25).map((s) => s.durationMs));
  });
});
