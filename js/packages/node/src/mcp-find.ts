import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findNPlusOneDb, findNPlusOneHttp, parseSearch, queryText, type TimeRange, type Trace } from "@wizeworks/lens-core";
import { z } from "zod";
import { json, type McpDataSource, READ_ONLY, type Source } from "./mcp-shared.js";
import { findAll, rangeArg } from "./mcp-store.js";

/** How many slow queries are read, newest first, before the slowest are picked. */
const SLOW_SCAN = 5_000;

/** The slowest database spans over `threshold` in the range, with their SQL. Only the picked spans load their trace. */
async function slowQueries(data: McpDataSource, threshold: number, range: TimeRange, limit: number) {
  const spans = await findAll(data, "spans", parseSearch(`category:db duration:>=${threshold}ms`), range, SLOW_SCAN);
  const top = spans.sort((a, b) => b.durationMs - a.durationMs).slice(0, limit);
  const traces = new Map<string, Promise<Trace | undefined>>();
  const rows = [];
  for (const s of top) {
    const trace = await (traces.get(s.traceId) ?? traces.set(s.traceId, Promise.resolve(data.get(s.traceId, false))).get(s.traceId)!);
    const span = trace?.spans.find((x) => x.spanId === s.spanId);
    rows.push({ traceId: s.traceId, spanId: s.spanId, durationMs: s.durationMs, query: span ? queryText(span) : s.name, service: s.service });
  }
  return rows;
}

function nPlusOne(traces: Trace[], n: number) {
  return traces.flatMap((t) => [
    ...findNPlusOneDb(t, n).map((f) => ({ traceId: t.traceId, kind: "db" as const, shape: f.shape, count: f.count, totalMs: f.totalMs })),
    ...findNPlusOneHttp(t, n).map((f) => ({ traceId: t.traceId, kind: "http" as const, shape: f.shape, count: f.count, totalMs: f.totalMs })),
  ]);
}

function registerSlowQueries(server: McpServer, src: Source): void {
  const inputSchema = {
    ...src.arg,
    thresholdMs: z.number().min(0).optional().describe(`Default ${src.defaults.slowQueryMs}.`),
    limit: z.number().int().min(1).max(500).optional().describe("Default 20."),
    range: rangeArg("to look"),
  };
  const description = "Find the slowest database queries over a threshold, from the whole store.";
  server.registerTool("find_slow_queries", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const data = await src.open("find_slow_queries", args);
    return json(await slowQueries(data, args.thresholdMs ?? data.slowQueryMs, args.range ?? "24h", args.limit ?? 20));
  });
}

function registerNPlusOne(server: McpServer, src: Source): void {
  const inputSchema = { ...src.arg, minRepeats: z.number().int().min(2).optional().describe(`Default ${src.defaults.nPlusOneThreshold}.`) };
  const description = "Find N+1 patterns (same SQL or same HTTP call shape repeated in one trace).";
  server.registerTool("find_n_plus_one", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const data = await src.open("find_n_plus_one", args);
    return json(nPlusOne(await data.all(), args.minRepeats ?? data.nPlusOneThreshold));
  });
}

/** find_slow_queries and find_n_plus_one. */
export function registerFindTools(server: McpServer, src: Source): void {
  registerSlowQueries(server, src);
  registerNPlusOne(server, src);
}
