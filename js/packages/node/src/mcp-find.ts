import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findNPlusOneDb, findNPlusOneHttp, queryText, type Trace } from "@wizeworks/lens-core";
import { z } from "zod";
import { json, READ_ONLY, type Source } from "./mcp-shared.js";

function slowQueries(traces: Trace[], threshold: number) {
  return traces.flatMap((t) =>
    t.spans
      .filter((s) => s.category === "db" && s.durationMs >= threshold)
      .map((s) => ({ traceId: t.traceId, spanId: s.spanId, durationMs: s.durationMs, query: queryText(s), service: s.service })),
  );
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
  };
  const description = "Find database queries slower than a threshold across recent traces.";
  server.registerTool("find_slow_queries", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const data = await src.open("find_slow_queries", args);
    const rows = slowQueries(await data.all(), args.thresholdMs ?? data.slowQueryMs)
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, args.limit ?? 20);
    return json(rows);
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
