import { describe, expect, it } from "vitest";
import { HubStore } from "./store.js";
import { distinctOf, findTraceIds, listServices, loadTraces } from "./store-read.js";
import { span, T1, T2 } from "./test/helpers.js";

const sender = { service: "orders-api", environment: "dev", project: "shop", host: "box" };

function storeAt(clock: { now: number }, extra = {}) {
  return new HubStore({ path: ":memory:", now: () => clock.now, ...extra });
}

describe("HubStore", () => {
  it("keeps spans, logs, and remotes, and builds traces from them", () => {
    const store = storeAt({ now: 5000 });
    const log = { timeMs: 1_000_010, level: "info" as const, category: "app", message: "hi", service: "orders-api", spanId: null, attributes: {} };
    store.write({ sender, via: "addon", spans: [span(T1, "1".repeat(16))], logs: [{ traceId: T1, log }, { traceId: T1, log }], remotes: [{ traceId: T1, endpoint: "http://x/_wizelens" }] });
    const [t] = loadTraces(store.db, [T1]);
    expect(t).toMatchObject({ traceId: T1, spanCount: 1, remotes: ["http://x/_wizelens"] });
    expect(t!.logs).toHaveLength(1);
  });

  it("filters by environment, project, and change time", () => {
    const clock = { now: 1000 };
    const store = storeAt(clock);
    store.write({ sender, via: "addon", spans: [span(T1, "1".repeat(16))], logs: [], remotes: [] });
    clock.now = 2000;
    store.write({ sender: { ...sender, environment: "qa", project: "admin" }, via: "addon", spans: [span(T2, "2".repeat(16), { startMs: 1_000_100 })], logs: [], remotes: [] });
    expect(findTraceIds(store.db, { limit: 10 })).toEqual([T2, T1]);
    expect(findTraceIds(store.db, { limit: 10, env: "dev" })).toEqual([T1]);
    expect(findTraceIds(store.db, { limit: 10, project: "admin" })).toEqual([T2]);
    expect(findTraceIds(store.db, { limit: 10, since: 1500 })).toEqual([T2]);
    expect(distinctOf(store.db, "env")).toEqual(["dev", "qa"]);
    expect(distinctOf(store.db, "project")).toEqual(["admin", "shop"]);
  });

  it("drops the oldest traces past the count limit", () => {
    const store = storeAt({ now: 1_000_500 }, { maxTraces: 1 });
    store.write({ sender, via: "addon", spans: [span(T1, "1".repeat(16)), span(T2, "2".repeat(16), { startMs: 1_000_200 })], logs: [], remotes: [] });
    expect(store.prune()).toBe(1);
    expect(findTraceIds(store.db, { limit: 10 })).toEqual([T2]);
    expect(store.db.prepare("SELECT count(*) AS n FROM spans").get()).toEqual({ n: 1 });
  });

  it("marks services online by when it last heard from them", () => {
    const clock = { now: 0 };
    const store = storeAt(clock);
    store.write({ sender, via: "addon", spans: [], logs: [], remotes: [] });
    expect(listServices(store.db, 10_000)[0]).toMatchObject({ service: "orders-api", project: "shop", online: true, via: "addon" });
    expect(listServices(store.db, 60_000)[0]!.online).toBe(false);
  });
});
