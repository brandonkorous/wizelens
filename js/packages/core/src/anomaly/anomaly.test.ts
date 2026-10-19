import { describe, expect, it } from "vitest";
import { alertContext } from "../models/alerts.js";
import { anomalyAlertMessage, anomalyAlertPage } from "../models/anomaly-alert.js";
import { runPageSync } from "../models/index.js";
import { memoryExecutor } from "../scale/memory.js";
import { computePageSync, pageContext } from "../scale/run.js";
import { emptyAgg } from "../scale/agg.js";
import { ANOMALY_NOW, anomalyTraces, SPIKE_MS } from "../testing/anomaly-scenario.js";
import { judge, metricValue } from "./baseline.js";

const MIN = 60_000;
const agg = (n: number, err = 0) => ({ ...emptyAgg(), n, err });
const problems = (traces = anomalyTraces(), params: Record<string, string> = {}, now = ANOMALY_NOW) => runPageSync("problems", pageContext("1h", now, params), memoryExecutor(traces));

describe("baselines", () => {
  it("judges a bucket against earlier samples with a floor on the spread", () => {
    const flat = [agg(100), agg(100), agg(100)];
    expect(judge("requests", agg(125), flat)?.above).toBe(false);
    expect(judge("requests", agg(140), flat)).toMatchObject({ normal: 100, upper: 130, above: true });
    expect(judge("requests", agg(140), [agg(100)])).toBeNull();
    expect(judge("error_rate", agg(100, 4), flat)?.above).toBe(false);
    expect(judge("error_rate", agg(100, 9), flat)?.above).toBe(true);
    expect(judge("requests", agg(9), [agg(1), agg(1)])?.above).toBe(false);
    expect(metricValue("p95_ms", agg(0))).toBeNull();
  });
});

describe("problems page", () => {
  it("finds one problem from a spike after a release, with the release as the cause", () => {
    const m = problems();
    expect(m.baseline).toEqual({ mode: "week", samples: 4, learning: false });
    expect(m.problems).toHaveLength(1);
    const p = m.problems[0]!;
    expect(p.ongoing).toBe(true);
    expect(p.startMs).toBe(ANOMALY_NOW - SPIKE_MS);
    expect(p.services.map((s) => s.name).sort()).toEqual(["pay", "postgresql · payments", "shop"]);
    expect(p.cause).toMatchObject({ kind: "release", service: "pay", version: "2.0.0", atMs: ANOMALY_NOW - SPIKE_MS + 1_000 + 7 });
    expect(p.causes.map((c) => c.kind)).toEqual(["release", "error", "query", "downstream"]);
    expect(p.causes[1]).toMatchObject({ type: "TimeoutError", service: "pay" });
    expect(p.causes[3]).toMatchObject({ service: "postgresql · payments", serviceKind: "database" });
    expect(new Set(p.anomalies.map((a) => a.metric))).toEqual(new Set(["p95_ms", "error_rate"]));
    expect(p.title).toBe("Error rate above normal on pay and 2 more");
  });

  it("finds nothing in a normal hour, or before the spike", () => {
    expect(problems(anomalyTraces({ spike: false })).problems).toEqual([]);
    expect(problems(anomalyTraces(), {}, ANOMALY_NOW - SPIKE_MS).problems).toEqual([]);
  });

  it("selects a problem by id, or by a time and service from an alert link", () => {
    const id = problems().problems[0]!.id;
    const later = problems(undefined, {}, ANOMALY_NOW + 30_000).problems[0]!;
    expect([later.id, later.ongoing]).toEqual([id, true]);
    expect(problems(undefined, { problem: id }).selected?.id).toBe(id);
    expect(problems(undefined, { at: String(ANOMALY_NOW - 5 * MIN), focus: "pay" }).selected?.id).toBe(id);
    expect(problems(undefined, { at: String(ANOMALY_NOW - 5 * MIN), focus: "nope" }).selected).toBeNull();
    expect(problems(undefined, { problem: "nope" }).selected).toBeNull();
    expect(problems(undefined, { service: "pay" }).problems.map((p) => p.id)).toEqual([id]);
    expect(problems(undefined, { service: "nope" })).toMatchObject({ problems: [], total: 0, anomalies: 0 });
  });

  it("learns until two earlier weeks have data, and uses days while weeks are missing", () => {
    expect(problems(anomalyTraces({ weeks: 1 })).baseline).toMatchObject({ mode: "day", learning: true });
    const daily = problems(anomalyTraces({ days: 3 }));
    expect(daily.baseline).toEqual({ mode: "day", samples: 3, learning: false });
    expect(daily.problems).toHaveLength(1);
  });

  it("keeps fewer problems at low sensitivity, never more", () => {
    expect(problems(undefined, { sensitivity: "low" }).anomalies).toBeLessThanOrEqual(problems(undefined, { sensitivity: "high" }).anomalies);
    expect(problems(undefined, { sensitivity: "bogus" }).sensitivity).toBe("medium");
  });
});

describe("above normal alerts", () => {
  const ex = memoryExecutor(anomalyTraces());
  const run = (metric: "p95_ms" | "error_rate" | "requests", now = ANOMALY_NOW) => computePageSync(anomalyAlertPage(metric, 3), alertContext(15 * MIN, now), ex);

  it("fires on the service or endpoint furthest above normal, and names it", () => {
    const p95 = run("p95_ms");
    expect(p95.breach).toMatchObject({ metric: "p95_ms", above: true });
    expect(p95.value).toBe(p95.breach!.value);
    expect(anomalyAlertMessage("p95_ms", p95, "fired")).toMatch(/^p95 duration is above normal on /);
    expect(run("error_rate").breach?.above).toBe(true);
    expect(run("requests").breach).toBeNull();
  });

  it("stays quiet before the spike", () => {
    const before = run("p95_ms", ANOMALY_NOW - SPIKE_MS);
    expect(before.breach).toBeNull();
    expect(before.learning).toBe(false);
    expect(anomalyAlertMessage("p95_ms", before, "resolved")).toBe("p95 duration is back to normal everywhere.");
  });
});
