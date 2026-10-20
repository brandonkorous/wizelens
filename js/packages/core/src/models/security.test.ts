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

});

describe("security page: packages and issues", () => {
  it("lists known-vulnerable packages under A03, by the services that run them", () => {
    const advisory = { id: "GHSA-aaaa-bbbb-cccc", summary: "Prototype pollution", severity: "error" as const, aliases: ["CVE-2026-0001"], fixed: ["4.17.21"], url: "https://osv.dev/vulnerability/GHSA-aaaa-bbbb-cccc" };
    const packages = [
      { ecosystem: "npm" as const, name: "lodash", version: "4.17.20", services: ["api"], advisories: [advisory], firstSeenMs: SCENARIO_NOW - 1000, lastSeenMs: SCENARIO_NOW },
      { ecosystem: "npm" as const, name: "safe", version: "1.0.0", services: ["api"], advisories: [], firstSeenMs: SCENARIO_NOW, lastSeenMs: SCENARIO_NOW },
    ];
    const scan = { packages: 2, services: 1, checkedMs: SCENARIO_NOW };
    const m = run({}, "24h", { packages, packageScan: scan });
    const g = m.groups.find((x) => x.kind === "vulnerable-package")!;
    expect(g).toMatchObject({ owasp: "A03", severity: "error", shape: "npm lodash@4.17.20", endpoints: ["api"], count: 1 });
    expect(g.description).toBe("lodash 4.17.20 has 1 known advisory (CVE-2026-0001). Update to 4.17.21 or later.");
    expect(m.categories.find((c) => c.id === "A03")!.count).toBe(1);
    expect(m.scan).toEqual(scan);
    expect(m.groups.some((x) => x.shape.includes("safe@"))).toBe(false);
    expect(run({ service: "orders" }, "24h", { packages }).groups.some((x) => x.kind === "vulnerable-package")).toBe(false);
  });

  it("hides resolved risks until they come back", () => {
    const key = run().groups.find((g) => g.kind === "exposed-path")!.key;
    const issues = { [issueId("insight", key)]: { kind: "insight" as const, key, status: "resolved" as const, untilMs: null, resolvedMs: SCENARIO_NOW, assignee: null, updatedMs: SCENARIO_NOW } };
    expect(run({}, "24h", { issues }).groups.some((g) => g.key === key)).toBe(false);
    expect(run({ status: "resolved" }, "24h", { issues }).groups.map((g) => g.key)).toEqual([key]);
  });
});
