import { alignNow, FACT_SLOW_QUERY_MS, pageContext, runPage, searchSql, SQLITE_DIALECT, suggestSql, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core";
import { DEFAULT_N_PLUS_ONE, DEFAULT_SLOW_QUERY_MS, type McpDataSource, type OverviewPage } from "@wizeworks/lens-node/kit";
import type { HubData } from "./data.js";
import { metricsPage } from "./metrics-read.js";
import { hubExecutor, hubSettling, sqliteRunner } from "./scale-exec.js";
import { hubTags } from "./tags.js";

/** Recent traces the MCP tools search through. */
const MCP_RECENT = 2000;
/** A custom window may start a little before what the hub keeps: snapping moves it. */
const KEEP_SLACK_MS = 15 * 60_000;

/** One page model over every service, as `api/models/<page>` serves it. */
function pageOf(data: HubData) {
  return <P extends OverviewPage>(page: P, range: TimeRange, params: Record<string, string> = {}) => {
    const store = data.store;
    if (TIME_RANGES[range].ms > store.maxAgeMs) throw new Error("This range is longer than the hub keeps data.");
    const ctx = pageContext(range, alignNow(store.now()), params, { slowQueryMs: FACT_SLOW_QUERY_MS }, hubSettling(store, {}));
    if (store.now() - ctx.window.from > store.maxAgeMs + KEEP_SLACK_MS) throw new Error("This time window starts before the hub keeps data.");
    return runPage(page, ctx, hubExecutor(store, {}, data.keepRemote));
  };
}

export function hubMcpSource(data: HubData, name: string, version: string, audit: (line: string) => void): McpDataSource {
  const src = { d: SQLITE_DIALECT, run: sqliteRunner(data.store.db), scope: {} };
  return {
    service: name,
    version,
    slowQueryMs: DEFAULT_SLOW_QUERY_MS,
    nPlusOneThreshold: DEFAULT_N_PLUS_ONE,
    all: () => data.traces({ limit: MCP_RECENT }),
    get: (traceId, federate) => data.getTrace(traceId, federate),
    audit,
    metrics: (range, params) => metricsPage(data.store.db, range, {}, params, data.store.now()),
    search: (q) => searchSql(src, q),
    suggest: (r) => suggestSql(src, r),
    now: () => data.store.now(),
    page: pageOf(data),
    tags: () => hubTags(data.store.db),
  };
}
