import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorInfo, isErrorSpan } from "@wizeworks/lens-core";
import { z } from "zod";
import { type Audit, json, type McpDataSource, READ_ONLY } from "./mcp-shared.js";

function registerListTraces(server: McpServer, data: McpDataSource, audit: Audit): void {
  const inputSchema = {
    limit: z.number().int().min(1).max(500).optional().describe("Max traces. Default 20."),
    minDurationMs: z.number().min(0).optional().describe("Only traces at least this long."),
    status: z.enum(["unset", "ok", "error"]).optional().describe("Only traces with this status."),
  };
  const description = "List recent request traces captured by WizeLens, newest first.";
  server.registerTool("list_traces", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    audit("list_traces", args);
    const items = data
      .list(500)
      .filter((t) => args.minDurationMs === undefined || t.durationMs >= args.minDurationMs)
      .filter((t) => args.status === undefined || t.status === args.status)
      .slice(0, args.limit ?? 20);
    return json(items);
  });
}

function registerGetTrace(server: McpServer, data: McpDataSource, audit: Audit): void {
  const inputSchema = {
    traceId: z.string().regex(/^[0-9a-f]{32}$/).describe("32 hex trace id."),
    federate: z.boolean().optional().describe("Include spans from downstream services. Default true."),
  };
  const description = "Get one trace with all spans and logs (redacted). Federates across services by default.";
  server.registerTool("get_trace", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    audit("get_trace", args);
    const trace = await data.get(args.traceId, args.federate ?? true);
    return trace ? json(trace) : { ...json({ error: "trace not found" }), isError: true };
  });
}

function registerGetErrors(server: McpServer, data: McpDataSource, audit: Audit): void {
  const inputSchema = { limit: z.number().int().min(1).max(500).optional().describe("Default 20.") };
  const description = "List recent errors and exceptions with their stack traces.";
  server.registerTool("get_errors", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    audit("get_errors", args);
    const rows = data
      .all()
      .flatMap((t) => t.spans.filter(isErrorSpan).map((s) => ({ traceId: t.traceId, ...errorInfo(s) })))
      .slice(0, args.limit ?? 20);
    return json(rows);
  });
}

/** list_traces, get_trace, and get_errors. */
export function registerTraceTools(server: McpServer, data: McpDataSource, audit: Audit): void {
  registerListTraces(server, data, audit);
  registerGetTrace(server, data, audit);
  registerGetErrors(server, data, audit);
}
