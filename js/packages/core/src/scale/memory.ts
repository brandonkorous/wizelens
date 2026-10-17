// The memory executor: facts from traces in memory, summed per need. Used in the browser and by tests.
import { bucketIndex, inWindow, type TimeWindow } from "../stats/common.js";
import type { Trace } from "../types.js";
import { addContribution, type Agg, type Contribution, emptyAgg, trimAgg } from "./agg.js";
import { type FactOptions, type TraceFacts, traceFacts } from "./facts.js";
import { KIND_SPEC, type RollupKind } from "./kinds.js";
import { runList } from "./memory-lists.js";
import { emptyResults, type GroupNeed, type GroupRows, keyMatches, type NeedResults, type PageContext, type SeriesNeed, type SeriesRows, sortGroups, type SyncExecutor, type TraceNeed, windowOfRef } from "./needs.js";

interface Item {
  c: Contribution;
  traceId: string;
}

/** Contributions of one kind, newest first, so trace ids come out newest first. */
function indexByKind(facts: readonly TraceFacts[]): Map<RollupKind, Item[]> {
  const out = new Map<RollupKind, Item[]>();
  for (const f of facts) {
    for (const c of f.contributions) {
      const list = out.get(c.kind);
      if (list) list.push({ c, traceId: f.traceId });
      else out.set(c.kind, [{ c, traceId: f.traceId }]);
    }
  }
  for (const list of out.values()) list.sort((a, b) => b.c.timeMs - a.c.timeMs);
  return out;
}

function runGroups(items: readonly Item[], need: GroupNeed, w: TimeWindow): GroupRows {
  const spec = KIND_SPEC[need.kind];
  const map = new Map<string, Agg>();
  for (const { c, traceId } of items) {
    if (!inWindow(c.timeMs, w) || !keyMatches(c.key, need.filter)) continue;
    let a = map.get(c.key);
    if (!a) map.set(c.key, (a = emptyAgg(spec.hist)));
    addContribution(a, c, traceId, spec);
  }
  const rows = [...map].filter(([, a]) => a.n > 0.5).map(([key, a]) => ({ key, agg: trimAgg(a, need) }));
  // Without an order, rows come by key, so both executors agree.
  if (!need.order) return { rows: rows.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0)), total: rows.length };
  return { rows: sortGroups(rows, need.order.by, need.order.desc).slice(0, need.order.limit), total: rows.length };
}

function runSeries(items: readonly Item[], need: SeriesNeed, w: TimeWindow): SeriesRows {
  const spec = KIND_SPEC[need.kind];
  const fresh = () => Array.from({ length: need.buckets }, () => emptyAgg(spec.hist));
  const byKey: Record<string, Agg[]> = need.split ? {} : { "": fresh() };
  for (const { c, traceId } of items) {
    const i = keyMatches(c.key, need.filter) ? bucketIndex(c.timeMs, w, need.buckets) : -1;
    if (i < 0) continue;
    const list = (byKey[need.split ? c.key : ""] ??= fresh());
    addContribution(list[i]!, c, traceId, spec);
  }
  const trimmed = Object.entries(byKey).map(([k, list]) => [k, list.map((a) => trimAgg(a, { hist: need.hist, times: false }))]);
  return { byKey: Object.fromEntries(trimmed) };
}

/** By id when it started in one of the windows; else the newest trace in cur, like the Traces page fallback. */
function runTrace(traces: readonly Trace[], need: TraceNeed, ctx: PageContext): Trace | null {
  const windows = need.windows.map((r) => windowOfRef(ctx, r));
  const byId = need.traceId ? traces.find((t) => t.traceId === need.traceId && windows.some((w) => inWindow(t.startMs, w))) : undefined;
  if (byId) return byId;
  const cur = traces.filter((t) => inWindow(t.startMs, ctx.window));
  return cur.reduce<Trace | null>((a, t) => (!a || t.startMs > a.startMs ? t : a), null);
}

/** An executor over traces in memory. Facts are cached per trace object, so rebuilding it per render is cheap. */
export function memoryExecutor(traces: readonly Trace[], options: Partial<FactOptions> = {}): SyncExecutor & { facts(): readonly TraceFacts[] } {
  let facts: TraceFacts[] | null = null;
  let kinds: Map<RollupKind, Item[]> | null = null;
  const allFacts = () => (facts ??= traces.map((t) => traceFacts(t, options)));
  const itemsOf = (kind: RollupKind) => (kinds ??= indexByKind(allFacts())).get(kind) ?? [];
  return {
    facts: allFacts,
    runSync(needs, ctx): NeedResults {
      const out = emptyResults();
      for (const need of needs) {
        if (need.type === "groups") out.groups[need.id] = runGroups(itemsOf(need.kind), need, windowOfRef(ctx, need.window));
        else if (need.type === "series") out.series[need.id] = runSeries(itemsOf(need.kind), need, windowOfRef(ctx, need.window));
        else if (need.type === "list") out.lists[need.id] = runList(allFacts(), need, windowOfRef(ctx, need.window));
        else out.traces[need.id] = runTrace(traces, need, ctx);
      }
      return out;
    },
  };
}
