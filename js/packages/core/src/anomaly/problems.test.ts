import { describe, expect, it } from "vitest";
import type { CallMap } from "./causes.js";
import type { Anomaly } from "./detect.js";
import { problemsOf } from "./problems.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = 1_800_000_000_000;
const map: CallMap = { calls: () => false };
const inputs = { versions: [], errors: [], map, nearMs: 15 * MIN, bucketMs: 5 * MIN };

const anomaly = (startMs: number, endMs: number, row = "api:pay"): Anomaly => ({
  id: `${row}|${startMs}`, metric: "p95_ms", row, name: row.slice(4), kind: "api", endpoint: null, startMs, endMs, ongoing: false,
  peak: { value: 2, normal: 1, upper: 1.5, above: true }, series: { values: [], normals: [], uppers: [] },
});

describe("problems", () => {
  it("does not snowball: 3 anomalies 2 h apart are 3 problems", () => {
    // On a long range the buckets are an hour, so anomalies 2 h apart count as near.
    const found = problemsOf([0, 2, 4].map((h) => anomaly(T0 + h * HOUR, T0 + h * HOUR + 10 * MIN)), { ...inputs, nearMs: 2 * HOUR, bucketMs: HOUR });
    expect(found).toHaveLength(3);
  });

  it("does not chain anomalies that start close together into one long problem", () => {
    const chain = [0, 10, 20, 30, 40].map((m) => anomaly(T0 + m * MIN, T0 + (m + 12) * MIN));
    const found = problemsOf(chain, inputs);
    expect(found.length).toBeGreaterThan(1);
    for (const p of found) expect(Math.max(...p.anomalies.map((a) => a.startMs)) - p.startMs).toBeLessThanOrEqual(15 * MIN);
  });

  it("joins anomalies that overlap on the same service", () => {
    expect(problemsOf([anomaly(T0, T0 + 20 * MIN), anomaly(T0 + 5 * MIN, T0 + 30 * MIN)], inputs)).toHaveLength(1);
  });

  it("gives the same data in two projects different ids", () => {
    const one = anomaly(T0, T0 + 10 * MIN);
    expect(problemsOf([one], inputs, "project-a")[0]!.id).not.toBe(problemsOf([one], inputs, "project-b")[0]!.id);
  });
});
