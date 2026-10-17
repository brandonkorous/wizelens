import { expect, it } from "vitest";
import { memoryExecutor } from "../scale/memory.js";
import { computePageSync } from "../scale/run.js";
import { makeRequest } from "../testing/fixtures.js";
import type { Trace } from "../types.js";
import { alertBreached, alertContext, type AlertMetric, alertMessage, alertNeeds, alertPage } from "./alerts.js";

const NOW = 1_700_000_100_000;
const ok = makeRequest({ startMs: NOW - 30_000, serverMs: 40 });
const failed = makeRequest({ startMs: NOW - 20_000, status: 500, error: { type: "DbError", message: "down" } });
const failedBefore = makeRequest({ startMs: NOW - 90_000, status: 500, error: { type: "DbError", message: "down" } });
const value = (metric: AlertMetric, traces: Trace[]) => computePageSync(alertPage(metric), alertContext(60_000, NOW), memoryExecutor(traces));

it("measures alert metrics over a window", () => {
  expect(value("error_rate", [ok, failed])).toBe(50);
  expect(value("requests", [ok, failed])).toBe(2);
  expect(value("new_errors", [failed])).toBe(1);
  expect(value("new_errors", [failed, failedBefore])).toBe(0);
  expect(value("p95_ms", [])).toBeNull();
  expect(alertNeeds("new_errors").map((n) => (n.type === "groups" ? n.window : null))).toEqual(["cur", "prev"]);
});

it("fires on breaches, and on silence only for low traffic", () => {
  expect(alertBreached("error_rate", ">", 50, 5)).toBe(true);
  expect(alertBreached("p95_ms", ">", null, 100)).toBe(false);
  expect(alertBreached("requests", "<", null, 1)).toBe(true);
  expect(alertMessage("error_rate", ">", 7.5, 5)).toBe("Error rate is 7.5% (above 5%)");
});
