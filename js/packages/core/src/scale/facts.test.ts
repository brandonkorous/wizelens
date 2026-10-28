import { describe, expect, it } from "vitest";
import { isLooseTraceId } from "../loose.js";
import { percentileOf, sumOf } from "../stats/common.js";
import { insightGroupOf, type InsightSummary, requestInsightGroups } from "../stats/insights.js";
import { isFailed, requestRows } from "../stats/requests.js";
import { traceCards } from "../stats/traces.js";
import { timingParts } from "../testing/legacy/overview.js";
import { applyFilter, DURATION_OPTIONS, STATUS_OPTIONS } from "../testing/legacy/request-filter.js";
import { relErr, sumKind, totalOf } from "../testing/scale-util.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { isUptimeSpan } from "../uptime/check.js";
import { type Agg, avgOfAgg, emptyAgg, mergeAgg } from "./agg.js";
import { traceFacts } from "./facts.js";
import { histPercentile } from "./hist.js";
import { KEY_SEP, KIND_SPEC, type RollupKind, splitKey } from "./kinds.js";
import { keyMatches } from "./needs.js";

const traces = scenarioTraces();
const rows = requestRows(traces);

/** Sum the groups of a kind whose keys match the parts. */
function matching(kind: RollupKind, parts: (string | null)[]): Agg {
  let out = emptyAgg();
  for (const [key, a] of sumKind(traces, kind)) if (keyMatches(key, { parts })) out = mergeAgg(out, a, KIND_SPEC[kind]);
  return out;
}

describe("request facts", () => {
  it("req totals match the request rows", () => {
    const a = totalOf(traces, "req");
    expect(a).toMatchObject({ n: rows.length, err: rows.filter(isFailed).length });
    expect(a.sum).toBeCloseTo(sumOf(rows.map((r) => r.durationMs)), 6);
    expect(a.c.slice(0, 3)).toEqual([sumOf(rows.map((r) => r.dbCount)), rows.filter((r) => r.insights > 0).length, sumOf(rows.map((r) => r.insights))]);
    const p95 = percentileOf(rows.map((r) => r.durationMs), 95)!;
    expect(relErr(histPercentile(a.hist!, a.n, 95)!, p95)).toBeLessThanOrEqual(0.02);
  });

  it("req.dim answers every method, status, and duration filter", () => {
    const methods = ["", ...new Set(rows.map((r) => r.method))];
    for (const method of methods) {
      for (const [status] of STATUS_OPTIONS) {
        for (const [duration] of DURATION_OPTIONS) {
          const want = applyFilter(rows, { method, status, duration, service: "", q: "" });
          const got = matching("req.dim", [method || null, status && status !== "failed" ? status : null, status === "failed" ? "1" : null, duration || null]);
          expect([got.n, got.err, got.c[0]]).toEqual([want.length, want.filter(isFailed).length, sumOf(want.map((r) => r.dbCount))]);
        }
      }
    }
  });

  it("req.svc answers the service filter and marks the primary service", () => {
    const services = new Set(rows.flatMap((r) => [r.service, ...r.services]));
    for (const service of services) {
      const want = applyFilter(rows, { method: "", status: "", duration: "", service, q: "" });
      const got = matching("req.svc", [service, null, null, null, null]);
      expect([got.n, got.err, got.c[1], got.c[2]]).toEqual([want.length, want.filter(isFailed).length, want.filter((r) => r.insights > 0).length, rows.filter((r) => r.service === service).length]);
      expect(got.sum).toBeCloseTo(sumOf(want.map((r) => r.durationMs)), 6);
    }
  });

  it("req.part gives the timing parts", () => {
    const parts = sumKind(traces, "req.part");
    for (const p of timingParts(rows)) {
      const a = parts.get(p.key);
      expect(a ? avgOfAgg(a) : null).toBeCloseTo(p.avg ?? NaN, 6);
      if (a && p.p95) expect(relErr(histPercentile(a.hist!, a.n, 95)!, p.p95)).toBeLessThanOrEqual(0.02);
    }
  });
});

describe("trace facts", () => {
  it("counts traces, spans, and slow traces", () => {
    // Lines outside a request and uptime checks are not a trace to list.
    const listed = traces.filter((t) => !isLooseTraceId(t.traceId) && !t.spans.some(isUptimeSpan));
    const cards = traceCards(listed, { from: 0, to: SCENARIO_NOW + 1 }, 4);
    const a = totalOf(traces, "trace");
    expect([a.n, a.sum / a.n, a.c[0]]).toEqual([cards.count, cards.avgSpans, cards.slow]);
  });

  it("leave an uptime check out of the trace list and its counts", () => {
    const t = traces.find((x) => !isLooseTraceId(x.traceId))!;
    const probe = { ...t, spans: t.spans.map((s, i) => (i === 0 ? { ...s, category: "uptime" as const } : s)) };
    expect(traceFacts(t).trace).not.toBeNull();
    expect(traceFacts(probe).trace).toBeNull();
    expect(traceFacts(probe).contributions.some((c) => c.kind === "trace")).toBe(false);
  });
});

describe("insight facts", () => {
  it("rebuild every request insight group exactly", () => {
    const ins = sumKind(traces, "ins");
    const eps = sumKind(traces, "ins.ep");
    const groups = requestInsightGroups(traces);
    expect(new Set(ins.keys())).toEqual(new Set(groups.map((g) => g.key)));
    for (const g of groups) {
      const a = ins.get(g.key)!;
      const top = a.top as { kind: InsightSummary["kind"]; shape: string; traceId: string };
      const endpoints = [...eps].filter(([k]) => k.startsWith(g.key + KEY_SEP)).sort((x, y) => y[1].lastMs - x[1].lastMs).map(([k]) => splitKey(k)[1]!);
      const rebuilt = insightGroupOf(g.key, { kind: top.kind, shape: top.shape, occurrences: a.n, count: a.c[0]!, totalMs: a.sum, endpoints, lastSeenMs: a.lastMs, exampleTraceId: top.traceId });
      expect({ ...rebuilt, totalMs: Math.round(rebuilt.totalMs * 1e6) }).toEqual({ ...g, totalMs: Math.round(g.totalMs * 1e6) });
    }
  });
});
