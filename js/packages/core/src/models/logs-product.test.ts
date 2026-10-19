import { describe, expect, it } from "vitest";
import { isLooseTraceId, keepLooseLine, looseTraceIdOf, newLooseTraceId } from "../loose.js";
import { traceFacts } from "../scale/facts.js";
import { memoryExecutor } from "../scale/memory.js";
import { pageContext } from "../scale/run.js";
import { logPattern, patternIdOf } from "../stats/log-patterns.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { runPageSync } from "./index.js";

const traces = scenarioTraces();
const ex = memoryExecutor(traces);
const page = <P extends "logs" | "log-patterns" | "log-chart" | "traces">(p: P, params: Record<string, string> = {}) => runPageSync(p, pageContext("24h", SCENARIO_NOW, params), ex);

describe("log patterns", () => {
  it("mask numbers, ids, uuids, and quoted values", () => {
    expect(logPattern("User 42 paid 19.99 from 10.0.0.1")).toBe("User <num> paid <num> from <num>");
    expect(logPattern("Order 3f2a9c1e-0b4d-4e8a-9f00-1234567890ab not found")).toBe("Order <uuid> not found");
    expect(logPattern(`Tenant 'acme' asked for "big report"`)).toBe("Tenant <str> asked for <str>");
    expect(logPattern("Hash deadbeef42 and 0x1F and token AbCdEf0123456789xyz")).toBe("Hash <id> and <id> and token <id>");
    expect(logPattern("first line\n  at stack frame 1")).toBe("first line");
    expect(patternIdOf("Cache warmed in 120 ms")).toBe(patternIdOf("Cache warmed in 98 ms"));
    expect(patternIdOf("Cache warmed in 120 ms")).not.toBe(patternIdOf("Cache cleared in 120 ms"));
  });

  it("group the scenario's lines with counts, trends, and samples", () => {
    const m = page("log-patterns");
    const warmed = m.rows.find((r) => r.pattern === "Cache warmed in <num> ms")!;
    const lines = page("logs", { pattern: warmed.id });
    expect([warmed.count, warmed.services, warmed.level]).toEqual([lines.matching, ["orders"], "info"]);
    expect(warmed.series.reduce<number>((t, v) => t + (v ?? 0), 0)).toBe(warmed.count);
    expect(warmed.sample).toMatch(/^Cache warmed in \d+ ms$/);
    expect(m.lines).toBe(page("logs").matching);
    expect(page("log-patterns", { level: "error" }).rows.every((r) => r.level === "error" || r.level === "critical")).toBe(true);
    expect(page("log-patterns", { origin: "outside" }).lines).toBe(page("logs", { origin: "outside" }).matching);
  });
});

describe("lines outside a request", () => {
  it("have loose trace ids", () => {
    const id = newLooseTraceId();
    expect([id.length, isLooseTraceId(id), isLooseTraceId("1".repeat(32))]).toEqual([32, true, false]);
    expect(looseTraceIdOf("api|prod|pod-1", 1_000)).toBe(looseTraceIdOf("api|prod|pod-1", 299_000));
    expect(looseTraceIdOf("api|prod|pod-1", 1_000)).not.toBe(looseTraceIdOf("api|prod|pod-1", 300_000));
    expect(isLooseTraceId(looseTraceIdOf("x", 0))).toBe(true);
  });

  it("are kept by the level floor and the sample rate; warnings always", () => {
    const o = { outside: true, minLevel: "info" as const, sampleRate: 0 };
    expect([keepLooseLine(o, "debug"), keepLooseLine(o, "info"), keepLooseLine(o, "warn"), keepLooseLine({ ...o, outside: false }, "error")]).toEqual([false, false, true, false]);
    expect(keepLooseLine({ ...o, sampleRate: 0.5 }, "info", () => 0.4)).toBe(true);
    expect(keepLooseLine({ ...o, sampleRate: 0.5 }, "info", () => 0.6)).toBe(false);
  });

  it("are log lines, never a trace or a request", () => {
    const loose = traces.find((t) => isLooseTraceId(t.traceId))!;
    const f = traceFacts(loose);
    expect([f.trace, f.request, f.contributions.some((c) => c.kind === "trace"), f.logs[0]?.traceName]).toEqual([null, null, false, ""]);
    expect(f.contributions.filter((c) => c.kind === "log.p").length).toBe(f.logs.length);
    const outside = page("logs", { origin: "outside" });
    expect(outside.rows.every((r) => isLooseTraceId(r.traceId))).toBe(true);
    expect(outside.matching + page("logs", { origin: "request" }).matching).toBe(page("logs").matching);
    expect(page("traces").recent.some((t) => isLooseTraceId(t.traceId))).toBe(false);
  });
});

describe("log charts", () => {
  it("count the lines of a search per bucket", () => {
    const chart = page("log-chart", { level: "warn" });
    expect(chart.total).toBe(page("logs", { level: "warn" }).matching);
    expect(chart.lines.reduce<number>((t, v) => t + (v ?? 0), 0)).toBe(chart.total);
    expect(chart.errorTotal).toBe(page("logs", { level: "error" }).matching);
  });
});
