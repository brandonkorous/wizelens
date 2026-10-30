import { afterEach, describe, expect, it } from "vitest";
import { REDACTED } from "@wizeworks/lens-core/internal";
import { scenarioTraces, SCENARIO_NOW } from "../../core/src/testing/scenario.js";
import { optionsFromArgs } from "./cli-args.js";
import type { Hub } from "./hub.js";
import { saveSettings } from "./settings.js";
import { span, startHub, T1 } from "./test/helpers.js";
import { clockStore, DAY, sender, settleAll, writeTraces } from "./test/scale.js";

let hub: Hub | undefined;
afterEach(() => hub?.close());

const call = async <T>(url: string, method: string, path: string, body?: unknown) => {
  const res = await fetch(`${url}/_wizelens/${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as T };
};

type Reply = { defaults: { slowQueryMs: number; retentionDays: number }; settings: Record<string, unknown>; effective: { slowQueryMs: number; redactKeys: string[] } };

describe("hub project settings", () => {
  it("reads the thresholds and extra keys from start options", () => {
    expect(optionsFromArgs(["--slow-query-ms", "250", "--n-plus-one", "8", "--redact-keys", "SSN, iban"], {})).toMatchObject({ slowQueryMs: 250, nPlusOneThreshold: 8 });
    expect((optionsFromArgs([], { WIZELENS_HUB_REDACT_KEYS: "ssn" }) as { redactKeys: string[] }).redactKeys).toContain("ssn");
  });

  it("keeps settings per project, checks them, and shows what is in effect", async () => {
    let url: string;
    ({ hub, url } = await startHub({ slowQueryMs: 200, maxAgeMs: 10 * DAY }));
    const info = (await call<{ capabilities: string[]; analysis: { slowQueryMs: number } }>(url, "GET", "api/info")).body;
    expect(info.capabilities).toContain("settings");
    expect(info.analysis.slowQueryMs).toBe(200);
    expect((await call<Reply>(url, "GET", "api/settings?project=shop")).body.defaults).toMatchObject({ slowQueryMs: 200, retentionDays: 10 });
    expect((await call<{ error: string }>(url, "PUT", "api/settings?project=shop", { retentionDays: 30 })).body.error).toMatch(/1 to 10/);
    const saved = await call<Reply>(url, "PUT", "api/settings?project=shop", { slowQueryMs: 50, redactKeys: ["ssn"] });
    expect(saved.body.effective.slowQueryMs).toBe(50);
    expect(saved.body.effective.redactKeys).toContain("ssn");
    expect((await call<Reply>(url, "GET", "api/settings?project=other")).body.settings).toEqual({});
  });

});

describe("hub project settings in the store", () => {
  it("hides a project's extra keys when it writes", () => {
    const { store } = clockStore();
    saveSettings(store.db, "shop", { redactKeys: ["ssn"] });
    store.write({ sender, via: "addon", spans: [span(T1, "1".repeat(16), { attributes: { "user.ssn": "123" } })], logs: [], remotes: [] });
    const row = store.db.prepare("SELECT json FROM spans").get() as { json: string };
    expect(JSON.parse(row.json).attributes["user.ssn"]).toBe(REDACTED);
  });

  it("settles with the project's thresholds", () => {
    const insights = (slowQueryMs?: number) => {
      const { store, clock } = clockStore();
      if (slowQueryMs) saveSettings(store.db, "shop", { slowQueryMs });
      writeTraces(store, scenarioTraces());
      settleAll(store, clock);
      return (store.db.prepare("SELECT sum(insights) AS n FROM fact_requests").get() as { n: number }).n;
    };
    expect(insights(1)).toBeGreaterThan(insights());
  });

  it("prunes a project with a shorter retention sooner", () => {
    const { store, clock } = clockStore();
    writeTraces(store, scenarioTraces());
    settleAll(store, clock);
    const old = () => (store.db.prepare("SELECT count(*) AS n FROM traces WHERE start_ms < ?").get(SCENARIO_NOW - 2 * DAY) as { n: number }).n;
    expect(old()).toBeGreaterThan(0);
    saveSettings(store.db, "shop", { retentionDays: 2 });
    store.prune();
    expect(old()).toBe(0);
    expect((store.db.prepare("SELECT count(*) AS n FROM traces").get() as { n: number }).n).toBeGreaterThan(0);
  });
});
