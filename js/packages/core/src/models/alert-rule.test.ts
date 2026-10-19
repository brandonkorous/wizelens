import { describe, expect, it } from "vitest";
import { memoryExecutor } from "../scale/memory.js";
import { computePageSync } from "../scale/run.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { parseAlertRule } from "./alert-parse.js";
import { alertStep, MUTED_FOREVER } from "./alert-rule.js";
import { alertContext, alertMessage, alertPage, opHolds } from "./alerts.js";

const rule = { state: "ok" as const, ackMs: null, remindMs: 900_000, lastNotifiedMs: null, mutedUntilMs: null };

describe("alert rule step", () => {
  it("fires, reminds until acknowledged, and resolves", () => {
    expect(alertStep(rule, true, 0)).toEqual({ state: "firing", ackMs: null, notice: "fired" });
    const firing = { ...rule, state: "firing" as const, lastNotifiedMs: 0 };
    expect(alertStep(firing, true, 600_000).notice).toBeNull();
    expect(alertStep(firing, true, 900_000).notice).toBe("remind");
    expect(alertStep({ ...firing, ackMs: 1 }, true, 900_000).notice).toBeNull();
    expect(alertStep({ ...firing, ackMs: 1 }, false, 900_000)).toEqual({ state: "ok", ackMs: null, notice: "resolved" });
  });

  it("changes state quietly while muted", () => {
    expect(alertStep({ ...rule, mutedUntilMs: MUTED_FOREVER }, true, 0)).toEqual({ state: "firing", ackMs: null, notice: null });
    expect(alertStep({ ...rule, mutedUntilMs: 10 }, true, 11).notice).toBe("fired");
  });

  it("knows four operators and words them", () => {
    expect([opHolds(">=", 5, 5), opHolds(">", 5, 5), opHolds("<=", 5, 5), opHolds("<", 4, 5)]).toEqual([true, false, true, true]);
    expect(alertMessage("error_rate", ">=", 5, 5, "remind")).toBe("Error rate is 5% (still at or above 5%)");
  });
});

describe("parseAlertRule", () => {
  const hooks = { checkUrl: async (u: string) => (u.startsWith("https://") ? null : "Use an https:// URL.") };
  const base = { name: "x", metric: "error_rate", op: ">", threshold: 5, windowMs: 300_000 };
  it("takes every channel kind but email without a mail hook", async () => {
    const channels = [{ kind: "teams", url: "https://t" }, { kind: "discord", url: "https://d" }, { kind: "pagerduty", routingKey: "abcdefghijklmnopqrstuvwx" }];
    expect(await parseAlertRule({ ...base, channels, service: "api", endpoint: "GET /x", remindMs: 3_600_000 }, hooks)).toMatchObject({ channels, service: "api", endpoint: "GET /x", remindMs: 3_600_000 });
    expect(await parseAlertRule({ ...base, channels: [{ kind: "email", to: ["a@b"] }] }, hooks)).toMatch(/no email/);
    expect(await parseAlertRule({ ...base, channels: [{ kind: "slack", url: "http://x" }] }, hooks)).toMatch(/https/);
    expect(await parseAlertRule({ ...base, channels: new Array(6).fill({ kind: "slack", url: "https://s" }) }, hooks)).toMatch(/at most 5/);
    expect(await parseAlertRule({ ...base, remindMs: 7 }, hooks)).toMatch(/reminder/);
  });
});

describe("scoped alert values", () => {
  const ex = memoryExecutor(scenarioTraces());
  const ctx = alertContext(7 * 86_400_000, SCENARIO_NOW);
  const value = (scope: { service?: string; endpoint?: string }) => computePageSync(alertPage("requests", scope), ctx, ex);
  it("count one service, and one endpoint of it, within the whole", () => {
    const all = value({})!;
    const api = value({ service: "api" })!;
    const pay = value({ service: "api", endpoint: "POST /api/pay" })!;
    expect([all > api, api > pay, pay > 0]).toEqual([true, true, true]);
    expect(computePageSync(alertPage("error_rate", { service: "api", endpoint: "POST /api/pay" }), ctx, ex)).toBeGreaterThan(0);
  });
});
