import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerFindTools } from "./mcp-find.js";
import { type Audit, type McpDataSource } from "./mcp-shared.js";
import { registerTraceTools } from "./mcp-traces.js";

export type { McpDataSource } from "./mcp-shared.js";

function createServer(data: McpDataSource): McpServer {
  const server = new McpServer({ name: "wizelens", version: data.version });
  const audit: Audit = (tool, args) =>
    data.audit(`[wizelens] mcp tool=${tool} service=${data.service} args=${JSON.stringify(args ?? {})}`);
  registerTraceTools(server, data, audit);
  registerFindTools(server, data, audit);
  return server;
}

/** Handle one MCP streamable HTTP request in stateless mode. */
export async function handleMcp(data: McpDataSource, req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
  const server = createServer(data);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
