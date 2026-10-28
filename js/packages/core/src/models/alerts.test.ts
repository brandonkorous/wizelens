import { expect, it } from "vitest";
import { memoryExecutor } from "../scale/memory.js";
import { computePageSync } from "../scale/run.js";
import { makeRequest } from "../testing/fixtures.js";
import { buildTrace } from "../trace.js";
import type { Trace } from "../types.js";
import type { UptimeCheck } from "../uptime/check.js";
import { uptimeTelemetry } from "../uptime/span.js";
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
  expect(alertMessage("requests", ">", 69, 1000, "resolved")).toBe("Requests is 69 (no longer above 1000)");
  expect(alertMessage("requests", ">", null, 5, "test")).toBe("Requests is not measured (alerts when above 5)");
});

it("counts the uptime checks that failed in the window, and nothing without runs", () => {
  const check = (id: string): UptimeCheck => ({
    id, name: id, url: "http://localhost:4173/", method: "GET", headers: {}, expectStatus: "200-299", expectBody: "", intervalMin: 1,
    timeoutMs: 5000, env: "", enabled: true, createdMs: 0, state: "up", lastRunMs: 0, lastDurationMs: 1, lastStatus: 200, lastError: null, tlsExpiresMs: null,
  });
  const run = (id: string, ok: boolean, ago: number) => {
    const r = { startMs: NOW - ago, durationMs: 5, ok, status: ok ? 200 : null, error: ok ? null : "connect ECONNREFUSED", tlsExpiresMs: null, finalUrl: "http://localhost:4173/" };
    const s = uptimeTelemetry(check(id), r).spans[0]!;
    return buildTrace(s.traceId, [s], [], []);
  };
  expect(value("uptime_failing", [run("home", false, 20_000), run("home", false, 10_000), run("contact", true, 15_000)])).toBe(1);
  expect(value("uptime_failing", [run("home", true, 20_000), run("contact", true, 15_000)])).toBe(0);
  expect(value("uptime_failing", [ok])).toBeNull();
  expect(alertMessage("uptime_failing", ">", 2, 0)).toBe("Uptime checks failing is 2 (above 0)");
});
