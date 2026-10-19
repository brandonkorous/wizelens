import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerFindTools } from "./mcp-find.js";
import { registerMetricTools } from "./mcp-metrics.js";
import { registerOverviewTool } from "./mcp-overview.js";
import { registerProblemTools } from "./mcp-problems.js";
import { projectsSource, registerProjectTools, singleSource } from "./mcp-projects.js";
import { type McpDataSource, type McpProjects, type Source } from "./mcp-shared.js";
import { registerSearchTools } from "./mcp-search.js";
import { registerTagTools } from "./mcp-tags.js";
import { registerTraceTools } from "./mcp-traces.js";

export type { McpDataSource, McpProject, McpProjects, OverviewPage } from "./mcp-shared.js";

const isProjects = (d: McpDataSource | McpProjects): d is McpProjects => "projects" in d;

const MANY = "You can read several projects. Call list_projects, then pass `project` to the other tools. get_overview without `project` reports on all of them.";

function createServer(data: McpDataSource | McpProjects): McpServer {
  const many = isProjects(data) && data.projects.length > 1;
  const server = new McpServer({ name: "wizelens", version: data.version }, many ? { instructions: MANY } : undefined);
  const src: Source = isProjects(data) ? projectsSource(data) : singleSource(data);
  if (isProjects(data)) registerProjectTools(server, data);
  registerTraceTools(server, src);
  registerFindTools(server, src);
  registerMetricTools(server, src);
  registerSearchTools(server, src);
  registerTagTools(server, src);
  registerOverviewTool(server, src);
  registerProblemTools(server, src);
  return server;
}

/** Handle one MCP streamable HTTP request in stateless mode, for one data source or several projects. */
export async function handleMcp(data: McpDataSource | McpProjects, req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
  const server = createServer(data);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
