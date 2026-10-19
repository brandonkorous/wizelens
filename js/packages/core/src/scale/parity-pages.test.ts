import { describe, expect, it } from "vitest";
import { runPageSync } from "../models/index.js";
import * as legacy from "../testing/legacy/index.js";
import { differences, newModel, PARITY_RANGES, parityOf } from "../testing/parity.js";
import { normalizeModel } from "../testing/parity-normalize.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { memoryExecutor } from "./memory.js";
import { pageContext } from "./run.js";

describe("parity: database, rendering, errors, logs, services", () => {
  it("database matches", () => {
    for (const range of PARITY_RANGES) expect(parityOf("database", range, { size: "200" })).toEqual([]);
  });

  it("rendering matches", () => {
    for (const range of PARITY_RANGES) expect(parityOf("rendering", range)).toEqual([]);
  });

  it("errors matches", () => {
    // The legacy model listed up to 200 groups; one page that size holds them all.
    for (const range of PARITY_RANGES) expect(parityOf("errors", range, { size: "200" })).toEqual([]);
  });

  it("logs matches with every filter and on page 2", () => {
    const params: Record<string, string>[] = [{}, { level: "warn" }, { level: "error" }, { level: "bogus" }, { service: "api" }, { service: "Web App" }, { q: "order" }, { q: "5c0" }, { level: "info", service: "orders", q: "placed" }, { page: "2", size: "5" }, { page: "999" }];
    // With a service, the cards and charts count that service only now; the legacy model counted every line.
    const skip = (p: Record<string, string>) => (p.service ? ["totalLines", "volume", "cards", "change", "sparks"] : []);
    for (const range of PARITY_RANGES) for (const p of params) expect(parityOf("logs", range, p, skip(p))).toEqual([]);
  });

  it("services matches, with every row selected by key, and by name", () => {
    for (const range of PARITY_RANGES) {
      const rows = newModel("services", range).rows;
      expect(rows.length).toBeGreaterThan(3);
      expect(parityOf("services", range)).toEqual([]);
      for (const r of rows) {
        // Queue and worker rows list no endpoints today, and show their traffic now: compare the rest.
        const params = { service: r.key };
        expect(parityOf("services", range, params, r.kind === "queue" || r.kind === "worker" ? ["selected.traffic"] : [])).toEqual([]);
      }
      expect(parityOf("services", range, { service: "orders" })).toEqual([]);
      expect(parityOf("services", range, { service: "nope" })).toEqual([]);
    }
  });
});

describe("parity: a live slow query threshold, as in-app hosts use", () => {
  it("database matches at 10 ms", () => {
    const ex = memoryExecutor(scenarioTraces(), { slowQueryMs: 10 });
    for (const range of PARITY_RANGES) {
      const now = runPageSync("database", pageContext(range, SCENARIO_NOW, { size: "200" }, { slowQueryMs: 10 }), ex);
      const before = legacy.PAGE_MODELS.database(legacy.modelInput(scenarioTraces(), range, SCENARIO_NOW, { slowQueryMs: 10 }, {}));
      expect(now.summary.slow).not.toBe(newModel("database", range).summary.slow);
      // Slow query insights follow the threshold now; the old code kept 100 ms for them.
      const { insights, ...rest } = normalizeModel("database", now) as { insights: unknown[] };
      const { insights: oldInsights, ...oldRest } = normalizeModel("database", before) as { insights: unknown[] };
      expect(differences(rest, oldRest)).toEqual([]);
      expect(insights.length).toBeGreaterThan(oldInsights.length);
    }
  });
});
