import { describe, expect, it } from "vitest";
import { issueId } from "../issues.js";
import { memoryExecutor } from "../scale/memory.js";
import type { PageContext } from "../scale/needs.js";
import { pageContext } from "../scale/run.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { runPageSync } from "./index.js";

const mem = () => memoryExecutor(scenarioTraces());
const run = (params: Record<string, string> = {}, range: "1h" | "24h" | "7d" = "24h", extra: Partial<PageContext> = {}) =>
  runPageSync("security", { ...pageContext(range, SCENARIO_NOW, params), ...extra }, mem());

describe("security page", () => {
  it("lists the scenario's risks with their OWASP categories", () => {
    const m = run();
    const kinds = new Set(m.groups.map((g) => g.kind));
    for (const k of ["sql-injection", "cookie-flags", "plain-http", "secret-in-url", "secret-leak", "open-admin", "exposed-path", "missing-headers", "version-header", "auth-guessing"]) expect(kinds, k).toContain(k);
    const sql = m.groups.find((g) => g.kind === "sql-injection")!;
    expect(sql).toMatchObject({ owasp: "A05", severity: "error", impact: "high", shape: "SELECT * FROM orders WHERE id = ?", endpoints: ["GET /api/orders/{id}"] });
    expect(m.categories.map((c) => c.id)).toEqual(["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "A10"]);
    expect(m.categories.find((c) => c.id === "A07")!.count).toBe(1);
    expect(m.totals.count).toBe(m.groups.length);
  });

  it("finds sign-in guessing from one address, with the 429s it got", () => {
    const g = run().groups.find((x) => x.kind === "auth-guessing")!;
    expect(g).toMatchObject({ shape: "POST /login", addresses: 1, title: "Many failed sign-ins from one address" });
    expect(g.count).toBeGreaterThanOrEqual(10);
    expect(run({}, "1h").groups.some((x) => x.kind === "auth-guessing")).toBe(false);
  });

  it("filters by category, severity, text, and endpoint, and selects one by key", () => {
    expect(run({ category: "A05" }).groups.every((g) => g.owasp === "A05")).toBe(true);
    expect(run({ severity: "info" }).groups.every((g) => g.severity === "info")).toBe(true);
    expect(run({ q: "nothing-matches-this" }).matching).toBe(0);
    expect(run({ endpoint: "POST /login" }).groups.every((g) => g.endpoints.includes("POST /login"))).toBe(true);
    const key = run().groups[0]!.key;
    expect(run({ key }).selected?.key).toBe(key);
  });

  it("hides resolved risks until they come back", () => {
    const key = run().groups.find((g) => g.kind === "exposed-path")!.key;
    const issues = { [issueId("insight", key)]: { kind: "insight" as const, key, status: "resolved" as const, untilMs: null, resolvedMs: SCENARIO_NOW, assignee: null, updatedMs: SCENARIO_NOW } };
    expect(run({}, "24h", { issues }).groups.some((g) => g.key === key)).toBe(false);
    expect(run({ status: "resolved" }, "24h", { issues }).groups.map((g) => g.key)).toEqual([key]);
  });
});
