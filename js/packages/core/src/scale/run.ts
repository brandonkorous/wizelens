// Run a page: build its context, answer its needs (and follow-up needs), then compute its model.
import type { ModelParams } from "../models/input.js";
import { previousWindow, type TimeRange, windowOf } from "../stats/common.js";
import { FACT_SLOW_QUERY_MS } from "./facts.js";
import type { Executor, NeedResults, PageContext, PageDef, SyncExecutor } from "./needs.js";
import { snapWindow } from "./window.js";

/** Pages by name. The page models fill one of these; hosts look pages up in it. */
export type PageRegistry = Readonly<Record<string, PageDef<unknown>>>;

/** The model type of a page definition. */
export type ModelOfDef<D> = D extends PageDef<infer M> ? M : never;

/** The context for a range ending at `now`: the window, the one before it, params, and options. */
export function pageContext(range: TimeRange, now: number, params: ModelParams, options: { slowQueryMs: number } = { slowQueryMs: FACT_SLOW_QUERY_MS }, settling: number | null = null): PageContext {
  const window = snapWindow(windowOf(range, now), now);
  return { range, window, prev: previousWindow(window), now, params, options, settling };
}

/** Results of two need runs together. Later ids replace earlier ones. */
export function mergeResults(a: NeedResults, b: NeedResults): NeedResults {
  return {
    groups: { ...a.groups, ...b.groups },
    series: { ...a.series, ...b.series },
    lists: { ...a.lists, ...b.lists },
    traces: { ...a.traces, ...b.traces },
  };
}

/** Compute a page with a database executor. */
export async function computePage<M>(def: PageDef<M>, ctx: PageContext, ex: Executor): Promise<M> {
  const first = await ex.run(def.needs(ctx), ctx);
  const more = def.followUp?.(ctx, first) ?? [];
  const all = more.length ? mergeResults(first, await ex.run(more, ctx)) : first;
  return def.model({ ...ctx, ...all });
}

/** Compute a page with the memory executor, in one go. */
export function computePageSync<M>(def: PageDef<M>, ctx: PageContext, ex: SyncExecutor): M {
  const first = ex.runSync(def.needs(ctx), ctx);
  const more = def.followUp?.(ctx, first) ?? [];
  const all = more.length ? mergeResults(first, ex.runSync(more, ctx)) : first;
  return def.model({ ...ctx, ...all });
}
