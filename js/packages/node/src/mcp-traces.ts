import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorInfo, isErrorSpan, parseSearch } from "@wizeworks/lens-core/internal";
import { z } from "zod";
import { json, type McpDataSource, READ_ONLY, type Source } from "./mcp-shared.js";
import { allOf, findAll, rangeArg } from "./mcp-store.js";

const failed = (error: string) => ({ ...json({ error }), isError: true });

function registerListTraces(server: McpServer, src: Source): void {
  const inputSchema = {
    ...src.arg,
    limit: z.number().int().min(1).max(500).optional().describe("Max traces. Default 20."),
    minDurationMs: z.number().min(0).optional().describe("Only traces at least this long."),
    status: z.enum(["unset", "ok", "error"]).optional().describe("Only traces with this status."),
    q: z.string().max(2000).optional().describe("Only traces that match this search (the `search` tool's language)."),
    range: rangeArg("to look"),
  };
  const description = "List request traces captured by WizeLens, newest first, from the whole store.";
  server.registerTool("list_traces", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const data = await src.open("list_traces", args);
    const where = allOf([args.minDurationMs === undefined ? null : `duration:>=${args.minDurationMs}ms`, args.status && `status:${args.status}`, args.q]);
    if (!where.ok) return failed(where.error);
    return json(await findAll(data, "traces", where.node, args.range ?? "24h", args.limit ?? 20));
  });
}

function registerGetTrace(server: McpServer, src: Source): void {
  const inputSchema = {
    ...src.arg,
    traceId: z.string().regex(/^[0-9a-f]{32}$/).describe("32 hex trace id."),
    federate: z.boolean().optional().describe("Include spans from downstream services. Default true."),
  };
  const description = "Get one trace with all spans and logs (redacted). Federates across services by default.";
  server.registerTool("get_trace", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const data = await src.open("get_trace", args);
    const trace = await data.get(args.traceId, args.federate ?? true);
    return trace ? json(trace) : { ...json({ error: "trace not found" }), isError: true };
  });
}

/** The error spans of the newest failed traces, up to `limit`, with their stack traces. */
async function errorsOf(data: McpDataSource, range: Parameters<typeof findAll>[3], limit: number) {
  const rows: ({ traceId: string } & ReturnType<typeof errorInfo>)[] = [];
  for (const item of await findAll(data, "traces", parseSearch("error:true"), range, limit)) {
    const trace = await data.get(item.traceId, false);
    for (const s of trace?.spans.filter(isErrorSpan) ?? []) rows.push({ traceId: item.traceId, ...errorInfo(s) });
    if (rows.length >= limit) break;
  }
  return rows.slice(0, limit);
}

function registerGetErrors(server: McpServer, src: Source): void {
  const inputSchema = { ...src.arg, limit: z.number().int().min(1).max(500).optional().describe("Default 20."), range: rangeArg("to look") };
  const description = "List errors and exceptions with their stack traces, newest first, from the whole store.";
  server.registerTool("get_errors", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const data = await src.open("get_errors", args);
    return json(await errorsOf(data, args.range ?? "24h", args.limit ?? 20));
  });
}

/** list_traces, get_trace, and get_errors. */
export function registerTraceTools(server: McpServer, src: Source): void {
  registerListTraces(server, src);
  registerGetTrace(server, src);
  registerGetErrors(server, src);
}
