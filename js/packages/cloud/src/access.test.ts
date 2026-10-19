import { afterEach, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { Client, setupOwner, startCloud } from "./test/cloud.js";
import { span, T1 } from "./test/db.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

async function withTrace() {
  let url: string;
  ({ cloud, url } = await startCloud());
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const key = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
  const failed = span(T1, "1".repeat(16), { status: "error", statusMessage: "boom", startMs: Date.now() - 1000, events: [{ name: "exception", timeMs: Date.now() - 990, attributes: { "exception.type": "Boom", "exception.message": "boom" } }] });
  await fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ sender: { service: "api" }, spans: [failed] }) });
  return { url, owner, orgId, projectId };
}

it("shares one trace by link, and stops when revoked", async () => {
  const { url, owner, projectId } = await withTrace();
  const made = await owner.call<{ url: string }>("POST", `api/projects/${projectId}/shares`, { traceId: T1, days: 3 });
  expect(made.status).toBe(201);
  const token = made.body.url.split("/shared/")[1]!;
  const stranger = new Client(url);
  expect((await stranger.call<{ trace: { traceId: string } }>("GET", `api/shared/${token}`)).body.trace.traceId).toBe(T1);
  expect((await stranger.call("GET", `api/traces/${T1}?project=${projectId}`)).status).toBe(401);
  const [share] = (await owner.call<{ id: string; views: number }[]>("GET", `api/projects/${projectId}/shares`)).body;
  expect(share!.views).toBe(1);
  await owner.call("DELETE", `api/projects/${projectId}/shares/${share!.id}`);
  expect((await stranger.call("GET", `api/shared/${token}`)).status).toBe(404);
});

it("serves MCP to read keys only, and audits every call", async () => {
  const { url, owner, orgId, projectId } = await withTrace();
  const read = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "read", name: "agent", projectIds: [projectId] })).body.token;
  const rpc = (auth: Record<string, string>) =>
    fetch(`${url}/_wizelens/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...auth },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_errors", arguments: {} } }),
    });
  expect((await rpc({ Cookie: owner.cookie })).status).toBe(401);
  const res = await rpc({ Authorization: `Bearer ${read}` });
  const body = (await res.json()) as { result: { content: { text: string }[] } };
  expect(body.result.content[0]!.text).toContain("boom");
  await new Promise((r) => setTimeout(r, 50));
  const audit = (await owner.call<{ action: string; actor: string }[]>("GET", `api/orgs/${orgId}/audit`)).body;
  expect(audit[0]).toMatchObject({ action: "mcp.call", actor: expect.stringMatching(/^key:/) });
});
