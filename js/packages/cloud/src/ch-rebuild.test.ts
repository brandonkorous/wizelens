import { afterAll, expect, it } from "vitest";
import { scenarioTraces } from "../../core/src/testing/scenario.js";
import { CH_URL, type ChTest, chSettle, chTest, chWrite } from "./test/ch.js";
import { parity } from "./test/scale.js";
import { chClient } from "./telemetry/ch/http.js";
import { openClickHouse } from "./telemetry/ch/store.js";

const traces = scenarioTraces();
const opened: ChTest[] = [];
afterAll(async () => Promise.all(opened.map((t) => t.drop())));

const PAGE = 7;
const rebuildState = async (t: ChTest) => (await chClient({ url: t.url }).query<{ value: string }>("SELECT value FROM ch_meta FINAL WHERE key = 'rebuild'"))[0]?.value;
const sameAsFresh = (t: ChTest) => parity({ ex: t.store.executor(t.projectId, t.retentionMs), retentionMs: t.retentionMs } as never, traces);

/** A settled store whose facts version then changes, so its stats rebuild a few traces at a time. */
async function changedVersion(): Promise<ChTest> {
  const t = await chTest(1000, undefined, { rebuildPage: PAGE });
  opened.push(t);
  await chWrite(t, traces);
  await chSettle(t);
  await chClient({ url: t.url }).insert("ch_meta", [{ key: "facts", value: "0", ver: Date.now() }]);
  expect(await t.store.checkFactsVersion()).toBe(true);
  return t;
}

/** Settle until the rebuild says it is done. */
async function settleAll(t: ChTest): Promise<number> {
  let runs = 0;
  while ((await rebuildState(t)) !== "done" && runs < 1_000) (await chSettle(t), runs++);
  return runs;
}

it.skipIf(!CH_URL)("rebuilds stats a page of traces at a time after the facts version changes", async () => {
  const t = await changedVersion();
  expect(await settleAll(t)).toBeGreaterThan(traces.length / PAGE);
  expect(await sameAsFresh(t)).toEqual([]);
}, 600_000);

it.skipIf(!CH_URL)("goes on from its last page after a restart", async () => {
  const t = await changedVersion();
  for (let i = 0; i < 3; i++) await chSettle(t);
  const store = await openClickHouse({ url: t.url, retentionOf: async (ids) => new Map(ids.map((id) => [id, 1000])), defaultRetentionDays: 1000, now: Date.now, ttl: false, rebuildPage: PAGE });
  const again = { ...t, store };
  expect(await store.checkFactsVersion()).toBe(false);
  await settleAll(again);
  expect(await sameAsFresh(again)).toEqual([]);
}, 600_000);
