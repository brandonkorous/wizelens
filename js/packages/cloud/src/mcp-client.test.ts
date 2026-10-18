import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { CH_URL } from "./test/ch.js";
import { setupOwner, startCloud } from "./test/cloud.js";
import { until } from "./test/notify.js";
import { span, T1 } from "./test/db.js";

let cloud: Cloud;
let agent: McpClient | undefined;
afterEach(async () => {
  await agent?.close();
  await cloud?.close();
  agent = undefined;
  cloud = undefined!;
});

/** Connect the way Claude Code does: initialize, the initialized notice, the GET stream, then tools/list. */
async function connect(url: string, token: string): Promise<McpClient> {
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  agent = new McpClient({ name: "test-agent", version: "1.0.0" });
  await agent.connect(transport);
  return agent;
}

/** On ClickHouse too when WIZELENS_TEST_CLICKHOUSE is set, as the hosted cloud runs. */
const telemetry = () => (CH_URL ? { clickhouseUrl: `${CH_URL.replace(/\/$/, "")}/wl_mcp_${Date.now().toString(36)}` } : {});

async function setup(projects: 1 | 2) {
  let url: string;
  ({ cloud, url } = await startCloud(telemetry()));
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const second = projects === 2 ? (await owner.call<{ id: string }>("POST", `api/orgs/${orgId}/projects`, { name: "Second" })).body.id : undefined;
  const projectIds = second ? [projectId, second] : [projectId];
  const ingest = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
  const failed = span(T1, "1".repeat(16), { status: "error", statusMessage: "boom", startMs: Date.now() - 1000 });
  await fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${ingest}` }, body: JSON.stringify({ sender: { service: "api" }, spans: [failed] }) });
  await until(async () => (await cloud.app.telemetry.traces({ projectId, limit: 1 })).length > 0, 10_000);
  const read = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "read", name: "agent", projectIds })).body.token;
  return { url, read, projectId };
}

it("an MCP client connects with a one-project read key and calls a tool", async () => {
  const { url, read } = await setup(1);
  const c = await connect(`${url}/_wizelens/mcp`, read);
  expect((await c.listTools()).tools.map((t) => t.name)).toContain("list_traces");
  const res = (await c.callTool({ name: "list_traces", arguments: {} })) as { content: { text: string }[] };
  expect(res.content[0]!.text).toContain(T1);
});

it("an MCP client connects with a many-project read key and ?project=", async () => {
  const { url, read, projectId } = await setup(2);
  const c = await connect(`${url}/_wizelens/mcp?project=${projectId}`, read);
  const res = (await c.callTool({ name: "list_traces", arguments: {} })) as { content: { text: string }[] };
  expect(res.content[0]!.text).toContain(T1);
});

it("a many-project read key connects without ?project= and picks a project per call", async () => {
  const { url, read, projectId } = await setup(2);
  const c = await connect(`${url}/_wizelens/mcp`, read);
  expect(c.getInstructions()).toContain("list_projects");
  const listed = (await c.callTool({ name: "list_projects", arguments: {} })) as { content: { text: string }[] };
  expect(JSON.parse(listed.content[0]!.text).map((p: { name: string }) => p.name)).toContain("Second");
  const missing = (await c.callTool({ name: "list_traces", arguments: {} })) as { isError?: boolean; content: { text: string }[] };
  expect(missing.isError).toBe(true);
  expect(missing.content[0]!.text).toContain("Add the project argument");
  const byId = (await c.callTool({ name: "list_traces", arguments: { project: projectId } })) as { content: { text: string }[] };
  expect(byId.content[0]!.text).toContain(T1);
  const byName = (await c.callTool({ name: "list_traces", arguments: { project: "second" } })) as { isError?: boolean; content: { text: string }[] };
  expect(byName.isError).toBeFalsy();
  expect(byName.content[0]!.text).not.toContain(T1);
});
