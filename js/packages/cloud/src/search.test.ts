import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PG_DIALECT, searchSql, suggestSql, windowOf } from "@wizeworks/lens-core";
import { scenarioTraces, SCENARIO_NOW } from "../../core/src/testing/scenario.js";
import { searchParity, suggestParity } from "../../core/src/testing/search-parity.js";
import { pgRunner } from "./scale-exec.js";
import { type ScaleDb, scaleDb, settleAll, writeTraces } from "./test/scale.js";

const traces = scenarioTraces();
let s: ScaleDb;
beforeAll(async () => {
  s = await scaleDb();
  await writeTraces(s, traces);
  await settleAll(s);
});
afterAll(() => s.db.close());

describe("cloud search", () => {
  it("pages through the same results as the memory runner", async () => {
    const src = { d: PG_DIALECT, run: pgRunner(s.db), scope: { project: s.projectId } };
    const windows = [windowOf("30d", SCENARIO_NOW), windowOf("1h", SCENARIO_NOW)];
    expect(await searchParity((q) => searchSql(src, q), traces, windows, "prod")).toEqual([]);
    expect(await suggestParity((r) => suggestSql(src, r), traces, windows[0]!)).toEqual([]);
  });

  it("never reads another project's rows", async () => {
    const src = { d: PG_DIALECT, run: pgRunner(s.db), scope: { project: "other" } };
    const page = await searchSql(src, { kind: "spans", node: null, window: windowOf("30d", SCENARIO_NOW), limit: 50 });
    expect(page.items).toEqual([]);
  });
});
