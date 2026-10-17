import { describe, expect, it } from "vitest";
import { bottlenecks } from "../stats/traces.js";
import { serviceEdges, serviceRows } from "../stats/services.js";
import { endpointsOf, spansOfRow } from "../testing/legacy/service-detail.js";
import { relErr, sumKind } from "../testing/scale-util.js";
import { scenarioTraces } from "../testing/scenario.js";
import { avgOfAgg } from "./agg.js";
import type { ServiceRowInfo } from "./facts-services.js";
import { histPercentile } from "./hist.js";
import { joinKey, KEY_SEP, splitKey } from "./kinds.js";

const traces = scenarioTraces();

/** The svc groups as the Services page reads them: workers that are also APIs are dropped. */
function serviceGroups() {
  const all = sumKind(traces, "svc");
  const apis = new Set([...all.keys()].filter((k) => k.startsWith("api:")).map((k) => k.slice(4)));
  return new Map([...all].filter(([k]) => !(k.startsWith("worker:") && apis.has(k.slice(7)))));
}

describe("service facts", () => {
  it("svc gives every Services row", () => {
    const groups = serviceGroups();
    const want = serviceRows(traces);
    expect(new Set(groups.keys())).toEqual(new Set(want.map((r) => r.key)));
    expect(sumKind(traces, "svc").has("worker:orders")).toBe(true);
    for (const r of want) {
      const a = groups.get(r.key)!;
      expect([a.n, a.err]).toEqual([r.requests, r.errors]);
      expect(avgOfAgg(a)).toBeCloseTo(r.avgMs!, 6);
      expect(relErr(histPercentile(a.hist!, a.n, 95)!, r.p95Ms!)).toBeLessThanOrEqual(0.02);
      expect(a.top as ServiceRowInfo).toEqual({ name: r.name, kind: r.kind, detail: r.detail });
    }
  });

  it("svc.ep gives the busiest endpoints of a row", () => {
    const eps = sumKind(traces, "svc.ep");
    for (const row of serviceRows(traces).filter((r) => r.kind !== "queue" && r.kind !== "worker")) {
      const want = endpointsOf(spansOfRow(traces, row), row, 1000);
      const got = [...eps].filter(([k]) => k.startsWith(row.key + KEY_SEP));
      expect(got.length).toBe(want.length);
      for (const e of want) {
        const a = eps.get(joinKey(row.key, e.name))!;
        expect([a.n, a.err]).toEqual([e.count, e.errors]);
        expect(avgOfAgg(a)).toBeCloseTo(e.avgMs!, 6);
      }
    }
  });
});

describe("edge and bottleneck facts", () => {
  it("edge gives the service map", () => {
    const edges = sumKind(traces, "edge");
    const want = serviceEdges(traces);
    expect(edges.size).toBe(want.length);
    for (const e of want) {
      const a = edges.get(joinKey(e.from, e.to))!;
      expect([a.n, a.err]).toEqual([e.calls, e.errors]);
      expect(avgOfAgg(a)).toBeCloseTo(e.avgMs!, 6);
      expect(a.top).toEqual({ from: e.from, to: e.to });
    }
  });

  it("bn.layer and bn.owner give the bottlenecks", () => {
    for (const [kind, by] of [["bn.layer", "layer"], ["bn.owner", "service"]] as const) {
      const groups = sumKind(traces, kind);
      const total = [...groups.values()].reduce((t, a) => t + a.sum, 0);
      const want = bottlenecks(traces, by);
      expect(groups.size).toBe(want.length);
      for (const b of want) {
        const a = groups.get(b.key)!;
        expect(a.sum).toBeCloseTo(b.totalMs, 6);
        expect((a.sum / total) * 100).toBeCloseTo(b.share, 6);
        if (kind === "bn.layer") expect(a.top).toEqual({ label: b.label, kind: b.kind });
      }
    }
  });

  it("keys never hold the separator inside a part", () => {
    for (const kind of ["svc", "svc.ep", "edge"] as const) {
      const sizes = new Set([...sumKind(traces, kind).keys()].map((k) => splitKey(k).length));
      expect(sizes.size).toBe(1);
    }
  });
});
