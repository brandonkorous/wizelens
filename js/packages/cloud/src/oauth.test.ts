import type { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { type Client, invite, joinWithInvite, setupOwner, startCloud } from "./test/cloud.js";
import { consentAs, connectWithOAuth, type Pick, TestAuth } from "./test/oauth.js";

let cloud: Cloud;
let agent: McpClient | undefined;
afterEach(async () => {
  await agent?.close();
  await cloud?.close();
  agent = undefined;
  cloud = undefined!;
});

type Text = { content: { text: string }[]; isError?: boolean };
const textOf = (r: unknown) => (r as Text).content[0]!.text;

/** A cloud with an owner and two projects; the owner connects an agent with `pick`. */
async function connected(pick: (orgId: string, first: string, second: string) => Pick) {
  let url: string;
  ({ cloud, url } = await startCloud());
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const second = (await owner.call<{ id: string }>("POST", `api/orgs/${orgId}/projects`, { name: "Second" })).body.id;
  const auth = new TestAuth(consentAs(url, owner, pick(orgId, projectId, second)));
  agent = await connectWithOAuth(`${url}/_wizelens/mcp`, auth);
  return { url, owner, orgId, first: projectId, second, auth };
}

const listed = async (c: McpClient) => (JSON.parse(textOf(await c.callTool({ name: "list_projects", arguments: {} }))) as { id: string }[]).map((p) => p.id);

it("publishes where to sign in, and a 401 points there", async () => {
  let url: string;
  ({ cloud, url } = await startCloud());
  const res = await fetch(`${url}/_wizelens/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  expect(res.status).toBe(401);
  expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${url}/.well-known/oauth-protected-resource/_wizelens/mcp"`);
  const prm = (await (await fetch(`${url}/.well-known/oauth-protected-resource/_wizelens/mcp`)).json()) as { resource: string; authorization_servers: string[] };
  expect(prm).toMatchObject({ resource: `${url}/_wizelens/mcp`, authorization_servers: [`${url}/_wizelens/api/auth`] });
  const as = (await (await fetch(`${url}/.well-known/oauth-authorization-server/_wizelens/api/auth`)).json()) as Record<string, unknown>;
  expect(as).toMatchObject({ issuer: `${url}/_wizelens/api/auth`, registration_endpoint: `${url}/_wizelens/api/auth/oauth2/register`, code_challenge_methods_supported: ["S256"] });
});

it("connects like Claude, reads only the projects picked, and audits each call with the app", async () => {
  const { orgId, owner, first } = await connected((organizationId, p) => ({ organizationId, projectIds: [p] }));
  const tools = (await agent!.listTools()).tools.map((t) => t.name);
  expect(tools).toEqual(expect.arrayContaining(["list_traces", "get_overview", "list_metrics"]));
  expect(tools).not.toContain("list_projects");
  expect((await agent!.callTool({ name: "list_traces", arguments: {} })).isError).toBeFalsy();
  const log = (await owner.call<{ action: string; detail: Record<string, unknown> }[]>("GET", `api/orgs/${orgId}/audit`)).body;
  expect(log.find((l) => l.action === "app.connect")?.detail).toMatchObject({ app: "Claude", projectIds: [first] });
  expect(log.find((l) => l.action === "mcp.call")?.detail).toMatchObject({ app: "Claude", projectId: first });
});

it("gives every project, also new ones, when the person picks all", async () => {
  const { owner, orgId, first, second } = await connected((organizationId) => ({ organizationId, allProjects: true }));
  const third = (await owner.call<{ id: string }>("POST", `api/orgs/${orgId}/projects`, { name: "Third" })).body.id;
  expect((await listed(agent!)).sort()).toEqual([first, second, third].sort());
  const report = JSON.parse(textOf(await agent!.callTool({ name: "get_overview", arguments: { range: "24h" } }))) as { totals: { projects: number }; projects: unknown[] };
  expect(report.totals.projects).toBe(3);
});

it("asks for refresh tokens, and a refreshed token still works", async () => {
  const { url, auth } = await connected((organizationId, p) => ({ organizationId, projectIds: [p] }));
  expect(auth.saved?.refresh_token).toMatch(/^wl_rt_/);
  expect(auth.saved?.scope?.split(" ")).toEqual(expect.arrayContaining(["wizelens:read", "offline_access"]));
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: auth.saved!.refresh_token!, client_id: auth.client!.client_id });
  const res = await fetch(`${url}/_wizelens/api/auth/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const next = (await res.json()) as { access_token: string };
  expect(res.status).toBe(200);
  const call = await fetch(`${url}/_wizelens/mcp`, { method: "POST", headers: mcpHeaders(next.access_token), body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
  expect(call.status).toBe(200);
});

it("stops at once when the person disconnects the app, or leaves the organization", async () => {
  const { url, owner, auth } = await connected((organizationId, p) => ({ organizationId, projectIds: [p] }));
  const apps = (await owner.call<{ apps: { id: string; app: string; projects: { name: string }[] }[] }>("GET", "api/me/apps")).body.apps;
  expect(apps).toMatchObject([{ app: "Claude", projects: [{ name: "My app" }] }]);
  expect((await owner.call("DELETE", `api/me/apps/${apps[0]!.id}`)).status).toBe(200);
  expect((await listRaw(url, auth.saved!.access_token)).status).toBe(401);
  expect((await owner.call<{ apps: unknown[] }>("GET", "api/me/apps")).body.apps).toEqual([]);
});

it("refuses a member who left, and an admin sees and ends others' apps", async () => {
  let url: string;
  ({ cloud, url } = await startCloud());
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const vic: Client = await joinWithInvite(url, await invite(owner, orgId, "vic@acme.io", "member"), "vic@acme.io");
  const auth = new TestAuth(consentAs(url, vic, { organizationId: orgId, projectIds: [projectId] }));
  agent = await connectWithOAuth(`${url}/_wizelens/mcp`, auth);
  const apps = (await owner.call<{ apps: { id: string; userEmail: string }[] }>("GET", `api/orgs/${orgId}/apps`)).body.apps;
  expect(apps).toMatchObject([{ userEmail: "vic@acme.io" }]);
  expect((await vic.call("POST", "api/auth/organization/leave", { organizationId: orgId })).status).toBe(200);
  expect((await listRaw(url, auth.saved!.access_token)).status).toBe(401);
  expect((await owner.call("DELETE", `api/orgs/${orgId}/apps/${apps[0]!.id}`)).status).toBe(200);
});

it("refuses projects from another organization and a bad signed query", async () => {
  let url: string;
  ({ cloud, url } = await startCloud());
  const { owner, orgId } = await setupOwner(cloud, url);
  const bad = await owner.call("POST", "api/auth/wizelens/oauth-grant", { organizationId: orgId, projectIds: ["nope"], oauth_query: "client_id=x&sig=y" });
  expect(bad.status).toBe(400);
});
const mcpHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" });

const listRaw = (url: string, token: string) =>
  fetch(`${url}/_wizelens/mcp`, { method: "POST", headers: mcpHeaders(token), body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
