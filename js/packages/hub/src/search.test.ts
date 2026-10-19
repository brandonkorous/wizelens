import { describe, expect, it } from "vitest";
import { SQLITE_DIALECT, searchSql, suggestSql, windowOf } from "@wizeworks/lens-core";
import { scenarioTraces, SCENARIO_NOW } from "../../core/src/testing/scenario.js";
import { searchHits, searchParity, SEARCH_PARITY_QUERIES, suggestParity } from "../../core/src/testing/search-parity.js";
import { tagParity } from "../../core/src/testing/tag-parity.js";
import { sqliteRunner } from "./scale-exec.js";
import { startHub } from "./test/helpers.js";
import { clockStore, settleAll, writeTraces } from "./test/scale.js";

const traces = scenarioTraces();

describe("hub search", () => {
  it("pages through the same results as the memory runner", async () => {
    const { store, clock } = clockStore();
    writeTraces(store, traces);
    settleAll(store, clock);
    const src = { d: SQLITE_DIALECT, run: sqliteRunner(store.db), scope: {} };
    const windows = [windowOf("30d", SCENARIO_NOW), windowOf("1h", SCENARIO_NOW)];
    expect(searchHits(traces, windows[0]!)).toBeGreaterThan(SEARCH_PARITY_QUERIES.length * 0.8);
    const t0 = performance.now();
    expect(await searchParity((q) => searchSql(src, q), traces, windows, "prod")).toEqual([]);
    expect(await suggestParity((r) => suggestSql(src, r), traces, windows[0]!)).toEqual([]);
    expect(await tagParity((q) => searchSql(src, q), traces, windows[0]!, "prod")).toEqual([]);
    console.log(`hub search parity: ${(performance.now() - t0).toFixed(0)} ms`);
  });
});

describe("hub search API", () => {
  it("answers searches, rejects bad ones with a position, and suggests fields", async () => {
    const { hub, url } = await startHub();
    try {
      const ok = await fetch(`${url}/_wizelens/api/search?q=${encodeURIComponent("service:api status:5xx")}&kind=spans&range=1h`);
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ kind: "spans", items: [], next: null });
      const bad = await fetch(`${url}/_wizelens/api/search?q=${encodeURIComponent("status:abc")}`);
      expect(bad.status).toBe(400);
      expect(await bad.json()).toMatchObject({ ok: false, start: 0, end: 10 });
      expect((await fetch(`${url}/_wizelens/api/search?kind=nope`)).status).toBe(400);
      const suggest = (await (await fetch(`${url}/_wizelens/api/search/suggest?prefix=se`)).json()) as { items: { value: string }[] };
      expect(suggest.items.map((s) => s.value)).toEqual(["service"]);
      const info = (await (await fetch(`${url}/_wizelens/api/info`)).json()) as { capabilities: string[] };
      expect(info.capabilities).toContain("search");
    } finally {
      await hub.close();
    }
  });
});
