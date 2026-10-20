// Page models for the in-app MCP tools: computed from the traces this app keeps, the way the dashboard does in the browser.
import { memoryExecutor, type ModelOf, type PageName, pageContext, runPageSync, type TimeRange, type Trace } from "@wizeworks/lens-core";

/** get_page and get_overview on the app's own traces, with its thresholds. */
export function memoryPages(traces: () => readonly Trace[], o: { slowQueryMs: number; nPlusOneThreshold: number }, now: () => number = Date.now) {
  return async <P extends PageName>(page: P, range: TimeRange, params: Record<string, string> = {}): Promise<ModelOf<P>> => {
    const ex = memoryExecutor(traces(), o);
    return runPageSync(page, pageContext(range, now(), params, { slowQueryMs: o.slowQueryMs }), ex);
  };
}
