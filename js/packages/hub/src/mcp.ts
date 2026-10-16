import { DEFAULT_N_PLUS_ONE, DEFAULT_SLOW_QUERY_MS, type McpDataSource } from "@wizeworks/lens-node/kit";
import type { HubData } from "./data.js";

/** Recent traces the MCP tools search through. */
const MCP_RECENT = 2000;

export function hubMcpSource(data: HubData, name: string, version: string, audit: (line: string) => void): McpDataSource {
  return {
    service: name,
    version,
    slowQueryMs: DEFAULT_SLOW_QUERY_MS,
    nPlusOneThreshold: DEFAULT_N_PLUS_ONE,
    list: (limit) => data.summaries({ limit }),
    all: () => data.traces({ limit: MCP_RECENT }),
    get: (traceId, federate) => data.getTrace(traceId, federate),
    audit,
  };
}
