import { describe, expect, it } from "vitest";
import { runPageSync } from "../models/index.js";
import { memoryExecutor } from "../scale/memory.js";
import { pageContext } from "../scale/run.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { requestRows } from "./requests.js";

const H = 60 * 60_000;
const ex = memoryExecutor(scenarioTraces());

describe("custom windows and compare", () => {
  it("reads a from–to window, and keeps a range that covers it", () => {
    const ctx = pageContext("24h", SCENARIO_NOW, { from: String(SCENARIO_NOW - 3 * H), to: String(SCENARIO_NOW - H) });
    expect(ctx).toMatchObject({ custom: true, range: "6h" });
    expect(ctx.window.to).toBe(SCENARIO_NOW - H);
    expect(ctx.prev.to).toBe(ctx.window.from);
  });

  it("ignores a window that makes no sense", () => {
    for (const p of [{ from: "x", to: "1" }, { from: String(SCENARIO_NOW), to: String(SCENARIO_NOW - H) }, { from: "1", to: String(SCENARIO_NOW + 2 * H) }]) {
      expect(pageContext("1h", SCENARIO_NOW, p)).toMatchObject({ custom: false, range: "1h" });
    }
  });

  it("compares with the same window a week earlier", () => {
    const ctx = pageContext("24h", SCENARIO_NOW, { compare: "week" });
    expect(ctx.window.from - ctx.prev.from).toBe(7 * 24 * H);
    const m = runPageSync("overview", ctx, ex);
    expect(m.meta).toMatchObject({ compare: "week", compareLabel: "vs. same time last week" });
  });

  it("counts only the custom window", () => {
    const params = { from: String(SCENARIO_NOW - 3 * H), to: String(SCENARIO_NOW - H) };
    const ctx = pageContext("24h", SCENARIO_NOW, params);
    const want = requestRows(scenarioTraces()).filter((r) => r.startMs >= ctx.window.from && r.startMs < ctx.window.to).length;
    const m = runPageSync("overview", ctx, ex);
    expect(m.headlines.total.value).toBe(want);
    expect(m.meta).toMatchObject({ custom: true, compareLabel: "vs. previous period" });
  });
});
