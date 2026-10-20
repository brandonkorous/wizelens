import { describe, expect, it } from "vitest";
import { memoryExecutor } from "../scale/memory.js";
import { pageContext } from "../scale/run.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { runPageSync } from "./index.js";

const ex = memoryExecutor(scenarioTraces());
const page = <P extends Parameters<typeof runPageSync>[0]>(p: P, params: Record<string, string> = {}) => runPageSync(p, pageContext("7d", SCENARIO_NOW, params), ex);

describe("users", () => {
  it("lists signed-in users by requests, and pages through them", () => {
    const m = page("users");
    expect(m.users.map((u) => u.user).sort()).toEqual(["user-0", "user-1", "user-2", "user-9"]);
    // Half of user-9's payments time out (500); the other half are rejected cards (400), which are not failures.
    expect(m.users.find((u) => u.user === "user-9")!.errorRate).toBe(50);
    expect(page("users", { q: "user-1" }).users.map((u) => u.user)).toEqual(["user-1"]);
    // Only user-9's requests carry a display name.
    expect(m.users.map((u) => [u.user, u.name]).sort()).toEqual([["user-0", null], ["user-1", null], ["user-2", null], ["user-9", "Ada Lovelace"]]);
  });

  it("shows one user's requests, slowest requests, and the errors they hit", () => {
    const m = page("user", { user: "user-9" });
    expect(m.totals!.requests).toBe(m.chart.requests.reduce<number>((t, n) => t + (n ?? 0), 0));
    expect(m.errors.length).toBeGreaterThan(0);
    expect(m.totals!.name).toBe("Ada Lovelace");
    expect(m.recent.every((r) => r.user === "user-9")).toBe(true);
    expect(page("user", { user: "nobody" }).totals).toBeNull();
  });

  it("counts the users an error group and an endpoint touched, and filters Errors and Logs by user", () => {
    const pay = page("errors", { user: "user-9", size: "200" });
    expect(pay.groups.length).toBeGreaterThan(0);
    const one = page("error", { group: pay.groups[0]!.key });
    expect(one.users).toMatchObject({ count: 1, top: [{ user: "user-9" }] });
    expect(page("endpoint", { service: "api:api", endpoint: "POST /api/pay" }).users.count).toBe(1);
    const logs = page("logs", { user: "user-0", size: "500" });
    const mine = new Set(page("requests", { user: "user-0", size: "500" }).rows.map((r) => r.traceId));
    expect(logs.rows.length).toBeGreaterThan(0);
    expect(logs.rows.every((r) => mine.has(r.traceId))).toBe(true);
  });
});
