import { describe, expect, it } from "vitest";
import { pageContext, runPage } from "@wizeworks/lens-core/internal";
import { ANOMALY_NOW, anomalyTraces } from "../../core/src/testing/anomaly-scenario.js";
import { pageParity, problemsParity } from "../../core/src/testing/scale-pages.js";
import { scenarioTraces } from "../../core/src/testing/scenario.js";
import { hubExecutor } from "./scale-exec.js";
import { settleHub } from "./settle.js";
import { post, span, startHub, T1 } from "./test/helpers.js";
import { clockStore, RANGES, RETENTION_MS, settleAll, writeTraces } from "./test/scale.js";

describe("hub pages", () => {
  it("computes every page from SQL like the memory executor", async () => {
    const traces = scenarioTraces();
    const { store, clock } = clockStore();
    writeTraces(store, traces);
    settleAll(store, clock);
    expect(await pageParity(hubExecutor(store), traces, RANGES, RETENTION_MS)).toEqual([]);
    expect((await pageParity(hubExecutor(store), traces.slice(2), ["1h"], RETENTION_MS)).length).toBeGreaterThan(5);
  });

  it("finds the spike's problem from SQL like the memory executor", async () => {
    const traces = anomalyTraces();
    const { store, clock } = clockStore();
    clock.now = ANOMALY_NOW;
    writeTraces(store, traces);
    settleAll(store, clock);
    expect(await problemsParity(hubExecutor(store), traces, ANOMALY_NOW, ["1h", "6h", "24h"], RETENTION_MS)).toEqual([]);
    const m = await runPage("problems", pageContext("1h", ANOMALY_NOW, {}), hubExecutor(store));
    expect(m.problems.map((p) => p.cause?.kind)).toEqual(["release"]);
  }, 60_000);

  it("serves page models, with no settling count while a new trace waits its few seconds", async () => {
    const { hub, url } = await startHub();
    try {
      const get = async (path: string) => {
        const res = await fetch(`${url}/_wizelens/api/${path}`);
        return { status: res.status, body: (await res.json()) as Record<string, unknown> & { meta?: { settling: number | null } } };
      };
      expect((await get("info")).body.capabilities).toContain("serverStats");
      const startMs = Date.now() - 60_000;
      await post(`${url}/_wizelens/api/ingest`, { sender: { service: "orders-api", project: "shop" }, spans: [span(T1, "1".repeat(16), { startMs, attributes: { "http.request.method": "GET", "url.path": "/orders", "http.response.status_code": 500 } })] });
      expect((await get("models/overview?range=1h&project=shop")).body.meta!.settling).toBeNull();
      settleHub(hub.data.store);
      const overview = await get("models/overview?range=1h&project=shop");
      expect(overview.body.meta!.settling).toBeNull();
      expect((overview.body.headlines as { total: { value: number } }).total.value).toBe(1);
      expect((await get("models/requests?range=1h&project=other")).body.total).toBe(0);
      expect((await get("models/badges?range=24h")).body).toEqual({ errors: 0 });
      expect((await get("models/nope")).status).toBe(404);
      expect((await get("models/overview?range=30d")).status).toBe(400);
      expect((await get("models/overview?range=forever")).status).toBe(400);
    } finally {
      await hub.close();
    }
  });
});
