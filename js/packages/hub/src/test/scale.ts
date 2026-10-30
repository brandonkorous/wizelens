import { type Executor, memoryExecutor, pageContext, type TimeRange, type Trace } from "@wizeworks/lens-core/internal";
import { compareResults } from "../../../core/src/testing/scale-compare.js";
import { parityNeeds } from "../../../core/src/testing/scale-needs.js";
import { SCENARIO_NOW } from "../../../core/src/testing/scenario.js";
import { settleHub } from "../settle.js";
import { HubStore } from "../store.js";

export const DAY = 86_400_000;
export const RETENTION_MS = 90 * DAY;
export const RANGES: TimeRange[] = ["15m", "1h", "6h", "24h", "7d", "30d"];
export const sender = { service: "api", environment: "prod", project: "shop" };

/** Write traces through the hub's normal write path, one batch per trace. */
export function writeTraces(store: HubStore, traces: readonly Trace[]): void {
  for (const t of traces) store.write({ sender, via: "addon", spans: t.spans, logs: t.logs.map((log) => ({ traceId: t.traceId, log })), remotes: [] });
}

/** A store whose clock the test moves, with retention long enough for 30 day ranges. */
export function clockStore(path = ":memory:", extra: { maxTraces?: number } = {}): { store: HubStore; clock: { now: number } } {
  const clock = { now: SCENARIO_NOW };
  return { store: new HubStore({ path, now: () => clock.now, maxAgeMs: RETENTION_MS, ...extra }), clock };
}

/** Let the quiet period pass, then settle everything. */
export function settleAll(store: HubStore, clock: { now: number }): number {
  clock.now += 10_000;
  return settleHub(store, { budgetMs: Infinity });
}

/** SQL results against memory results over `traces`, for every parity need and range. Returns the differences. */
export async function parity(ex: Executor, traces: readonly Trace[], ranges: readonly TimeRange[] = RANGES, skip?: ReadonlySet<string>): Promise<string[]> {
  const mem = memoryExecutor(traces);
  const out: string[] = [];
  for (const range of ranges) {
    const ctx = pageContext(range, SCENARIO_NOW, {});
    const needs = parityNeeds(ctx, mem);
    const diffs = compareResults(await ex.run(needs, ctx), mem.runSync(needs, ctx), needs, { ctx, facts: mem.facts(), retentionMs: RETENTION_MS, skip });
    out.push(...diffs.map((d) => `${range} ${d}`));
  }
  return out;
}
