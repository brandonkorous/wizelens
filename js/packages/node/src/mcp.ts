import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  errorInfo,
  findNPlusOneDb,
  findNPlusOneHttp,
  isErrorSpan,
  queryText,
  type Trace,
  type TraceSummary,
} from "@wizeworks/lens-core";
import { z } from "zod";

/** What the MCP tools can read. Read-only by design. */
export interface McpDataSource {
  service: string;
  version: string;
  list(limit: number): TraceSummary[];
  all(): Trace[];
  get(traceId: string, federate: boolean): Promise<Trace | undefined>;
  audit(line: string): void;
}

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

function createServer(data: McpDataSource): McpServer {
  const server = new McpServer({ name: "wizelens", version: data.version });
  const audit = (tool: string, args: unknown) =>
    data.audit(`[wizelens] mcp tool=${tool} service=${data.service} args=${JSON.stringify(args ?? {})}`);
  const readOnly = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    "list_traces",
    {
      description: "List recent request traces captured by WizeLens, newest first.",
      inputSchema: {
        limit: z.number().int().min(1).max(500).optional().describe("Max traces. Default 20."),
        minDurationMs: z.number().min(0).optional().describe("Only traces at least this long."),
        status: z.enum(["unset", "ok", "error"]).optional().describe("Only traces with this status."),
      },
      annotations: readOnly,
    },
    async (args) => {
      audit("list_traces", args);
      const items = data
        .list(500)
        .filter((t) => args.minDurationMs === undefined || t.durationMs >= args.minDurationMs)
        .filter((t) => args.status === undefined || t.status === args.status)
        .slice(0, args.limit ?? 20);
      return json(items);
    },
  );

  server.registerTool(
    "get_trace",
    {
      description: "Get one trace with all spans and logs (redacted). Federates across services by default.",
      inputSchema: {
        traceId: z.string().regex(/^[0-9a-f]{32}$/).describe("32 hex trace id."),
        federate: z.boolean().optional().describe("Include spans from downstream services. Default true."),
      },
      annotations: readOnly,
    },
    async (args) => {
      audit("get_trace", args);
      const trace = await data.get(args.traceId, args.federate ?? true);
      return trace ? json(trace) : { ...json({ error: "trace not found" }), isError: true };
    },
  );

  server.registerTool(
    "find_slow_queries",
    {
      description: "Find database queries slower than a threshold across recent traces.",
      inputSchema: {
        thresholdMs: z.number().min(0).optional().describe("Default 100."),
        limit: z.number().int().min(1).max(500).optional().describe("Default 20."),
      },
      annotations: readOnly,
    },
    async (args) => {
      audit("find_slow_queries", args);
      const threshold = args.thresholdMs ?? 100;
      const rows = data
        .all()
        .flatMap((t) =>
          t.spans
            .filter((s) => s.category === "db" && s.durationMs >= threshold)
            .map((s) => ({ traceId: t.traceId, spanId: s.spanId, durationMs: s.durationMs, query: queryText(s), service: s.service })),
        )
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, args.limit ?? 20);
      return json(rows);
    },
  );

  server.registerTool(
    "find_n_plus_one",
    {
      description: "Find N+1 patterns (same SQL or same HTTP call shape repeated in one trace).",
      inputSchema: {
        minRepeats: z.number().int().min(2).optional().describe("Default 5."),
      },
      annotations: readOnly,
    },
    async (args) => {
      audit("find_n_plus_one", args);
      const n = args.minRepeats ?? 5;
      const rows = data.all().flatMap((t) => [
        ...findNPlusOneDb(t, n).map((f) => ({ traceId: t.traceId, kind: "db" as const, shape: f.shape, count: f.count, totalMs: f.totalMs })),
        ...findNPlusOneHttp(t, n).map((f) => ({ traceId: t.traceId, kind: "http" as const, shape: f.shape, count: f.count, totalMs: f.totalMs })),
      ]);
      return json(rows);
    },
  );

  server.registerTool(
    "get_errors",
    {
      description: "List recent errors and exceptions with their stack traces.",
      inputSchema: {
        limit: z.number().int().min(1).max(500).optional().describe("Default 20."),
      },
      annotations: readOnly,
    },
    async (args) => {
      audit("get_errors", args);
      const rows = data
        .all()
        .flatMap((t) => t.spans.filter(isErrorSpan).map((s) => ({ traceId: t.traceId, ...errorInfo(s) })))
        .slice(0, args.limit ?? 20);
      return json(rows);
    },
  );

  return server;
}

/** Handle one MCP streamable HTTP request in stateless mode. */
export async function handleMcp(
  data: McpDataSource,
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
): Promise<void> {
  const server = createServer(data);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
