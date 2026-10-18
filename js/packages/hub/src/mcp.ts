import { searchSql, SQLITE_DIALECT, suggestSql } from "@wizeworks/lens-core";
import { DEFAULT_N_PLUS_ONE, DEFAULT_SLOW_QUERY_MS, type McpDataSource } from "@wizeworks/lens-node/kit";
import type { HubData } from "./data.js";
import { metricsPage } from "./metrics-read.js";
import { sqliteRunner } from "./scale-exec.js";

/** Recent traces the MCP tools search through. */
const MCP_RECENT = 2000;

export function hubMcpSource(data: HubData, name: string, version: string, audit: (line: string) => void): McpDataSource {
  const src = { d: SQLITE_DIALECT, run: sqliteRunner(data.store.db), scope: {} };
  return {
    service: name,
    version,
    slowQueryMs: DEFAULT_SLOW_QUERY_MS,
    nPlusOneThreshold: DEFAULT_N_PLUS_ONE,
    list: (limit) => data.summaries({ limit }),
    all: () => data.traces({ limit: MCP_RECENT }),
    get: (traceId, federate) => data.getTrace(traceId, federate),
    audit,
    metrics: (range, params) => metricsPage(data.store.db, range, {}, params, data.store.now()),
    search: (q) => searchSql(src, q),
    suggest: (r) => suggestSql(src, r),
    now: () => data.store.now(),
  };
}
