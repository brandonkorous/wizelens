import { expect, it } from "vitest";
import { memoryExecutor } from "../scale/memory.js";
import { pageContext } from "../scale/run.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { runPageSync } from "./index.js";

const ex = memoryExecutor(scenarioTraces());
const run = (params: Record<string, string> = {}) => runPageSync("traffic", pageContext("24h", SCENARIO_NOW, params), ex);
const total = (m: ReturnType<typeof run>) => m.points.reduce((t, p) => t + p.requests, 0);

it("counts every request per bucket, the same as the Overview page", () => {
  const m = run();
  const ov = runPageSync("overview", pageContext("24h", SCENARIO_NOW, {}), ex);
  expect(m.points).toHaveLength(24);
  expect(total(m)).toBe(ov.headlines.total.value);
  expect(m.totals.requests).toBe(total(m));
  expect(m.totals.p95Ms).not.toBeNull();
  expect(m.bucketMs).toBe(3_600_000);
});

it("narrows to one service and one endpoint, and lists that service's endpoints with p95", () => {
  const svc = run({ service: "api" });
  const row = runPageSync("service", pageContext("24h", SCENARIO_NOW, { service: "api" }), ex).row!;
  expect(svc.scope).toEqual({ service: "api", endpoint: null, found: true });
  expect(svc.totals).toMatchObject({ requests: row.requests, errors: row.errors });
  expect(svc.endpoints.length).toBeGreaterThan(1);
  expect(svc.endpoints.every((e) => e.service === "api" && e.p95Ms !== null)).toBe(true);
  const top = svc.endpoints[0]!;
  const one = run({ service: "api", endpoint: top.endpoint, buckets: "48" });
  expect(one.points).toHaveLength(48);
  expect(one.totals).toMatchObject({ requests: top.requests, errors: top.errors });
  expect(one.endpoints).toEqual([top]);
});

it("lists endpoints of every API busiest first, and finds an endpoint without its service", () => {
  const m = run();
  expect(m.endpoints.map((e) => e.requests)).toEqual([...m.endpoints.map((e) => e.requests)].sort((a, b) => b - a));
  expect(m.endpoints.every((e) => e.kind === "api" || e.kind === "web")).toBe(true);
  const top = m.endpoints[0]!;
  const same = m.endpoints.filter((e) => e.endpoint === top.endpoint).reduce((t, e) => t + e.requests, 0);
  expect(run({ endpoint: top.endpoint }).totals.requests).toBe(same);
});

it("is empty for a service that did nothing, and survives JSON", () => {
  const m = run({ service: "nope" });
  expect(m.scope.found).toBe(false);
  expect(m.points).toEqual([]);
  expect(m.endpoints).toEqual([]);
  expect(JSON.parse(JSON.stringify(run()))).toEqual(run());
});
