// Run a page: build its context, answer its needs (and follow-up needs), then compute its model.
import type { ModelParams } from "../models/input.js";
import { type TimeRange, windowOf } from "../stats/common.js";
import { compareOf, compareWindow, customWindow, rangeCovering } from "../stats/period.js";
import { FACT_SLOW_QUERY_MS } from "./facts.js";
import type { Executor, Need, NeedResults, PageContext, PageDef, PageOptions, SyncExecutor } from "./needs.js";
import { scopeNeed, unscopeResults } from "./scope.js";
import { snapWindow } from "./window.js";

/** Pages by name. The page models fill one of these; hosts look pages up in it. */
export type PageRegistry = Readonly<Record<string, PageDef<unknown>>>;

/** The model type of a page definition. */
export type ModelOfDef<D> = D extends PageDef<infer M> ? M : never;

/** The context for a range ending at `now` (or the custom `from`–`to` in params): the window, the one it is compared with (`compare`), params, and options. */
export function pageContext(range: TimeRange, now: number, params: ModelParams, options: PageOptions = { slowQueryMs: FACT_SLOW_QUERY_MS }, settling: number | null = null): PageContext {
  const custom = customWindow(params, now);
  const window = snapWindow(custom ?? windowOf(range, now), now);
  const compare = compareOf(params);
  return { range: custom ? rangeCovering(custom.to - custom.from) : range, window, prev: compareWindow(window, compare), now, params, options, settling, custom: !!custom, compare };
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

/** Answer needs, reading per-service kinds for `service` needs. */
async function answer(ex: Executor, needs: readonly Need[], ctx: PageContext): Promise<NeedResults> {
  return unscopeResults(await ex.run(needs.map(scopeNeed), ctx), needs);
}

const answerSync = (ex: SyncExecutor, needs: readonly Need[], ctx: PageContext): NeedResults => unscopeResults(ex.runSync(needs.map(scopeNeed), ctx), needs);

/** Compute a page with a database executor. */
export async function computePage<M>(def: PageDef<M>, ctx: PageContext, ex: Executor): Promise<M> {
  const first = await answer(ex, def.needs(ctx), ctx);
  const more = def.followUp?.(ctx, first) ?? [];
  const all = more.length ? mergeResults(first, await answer(ex, more, ctx)) : first;
  return def.model({ ...ctx, ...all });
}

/** Compute a page with the memory executor, in one go. */
export function computePageSync<M>(def: PageDef<M>, ctx: PageContext, ex: SyncExecutor): M {
  const first = answerSync(ex, def.needs(ctx), ctx);
  const more = def.followUp?.(ctx, first) ?? [];
  const all = more.length ? mergeResults(first, answerSync(ex, more, ctx)) : first;
  return def.model({ ...ctx, ...all });
}
