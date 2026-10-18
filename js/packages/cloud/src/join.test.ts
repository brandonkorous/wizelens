import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Span } from "@wizeworks/lens-core";
import type { Cloud } from "./server.js";
import { Client, invite, joinWithInvite, type Me, setupOwner, startCloud } from "./test/cloud.js";
import { span, T1, T2 } from "./test/db.js";

type Trace = { services: string[]; spanCount: number; logs: { message: string }[] };

let cloud: Cloud;
let url: string;
let owner: Client;
// Org A: the console app (pa1) and the shared API (pa2). Org B: another tenant (pb) that sends the same trace id.
let orgA: string, orgB: string, pa1: string, pa2: string, pb: string;

const key = async (org: string, kind: "ingest" | "read", projectIds: string[]) =>
  (await owner.call<{ token: string }>("POST", `api/orgs/${org}/keys`, { kind, projectIds })).body.token;

async function send(token: string, service: string, spans: Span[], logs: unknown[] = []) {
  const body = { sender: { service }, spans, logs };
  const res = await fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  expect(res.status).toBe(204);
}

const byKey = (token: string, traceId: string, project: string) =>
  fetch(`${url}/_wizelens/api/traces/${traceId}?project=${project}`, { headers: { Authorization: `Bearer ${token}` } });

beforeEach(async () => {
  ({ cloud, url } = await startCloud());
  ({ owner, orgId: orgA, projectId: pa1 } = await setupOwner(cloud, url));
  pa2 = (await owner.call<{ id: string }>("POST", `api/orgs/${orgA}/projects`, { name: "Shared API" })).body.id;
  orgB = (await owner.call<{ id: string }>("POST", "api/orgs", { name: "Beta" })).body.id;
  pb = (await owner.call<Me>("GET", "api/me")).body.orgs.find((o) => o.id === orgB)!.projects[0]!.id;
  const root = span(T1, "1".repeat(16), { service: "console", name: "GET /page" });
  const api = span(T1, "2".repeat(16), { service: "api-rest", parentSpanId: "1".repeat(16), startMs: 1_000_005 });
  await send(await key(orgA, "ingest", [pa1]), "console", [root]);
  await send(await key(orgA, "ingest", [pa2]), "api-rest", [api, span(T2, "4".repeat(16), { service: "api-rest" })], [{ traceId: T1, log: { timeMs: 1_000_006, level: "info", category: "api", message: "from the api", attributes: {} } }]);
  await send(await key(orgB, "ingest", [pb]), "intruder", [span(T1, "3".repeat(16), { service: "intruder" })], [{ traceId: T1, log: { timeMs: 1_000_007, level: "info", category: "x", message: "other tenant", attributes: {} } }]);
});

afterEach(async () => {
  await cloud?.close();
});

describe("traces across projects", () => {
  it("joins the parts from the same organization, never from another one", async () => {
    const t = (await owner.call<Trace>("GET", `api/traces/${T1}?project=${pa1}`)).body;
    expect([t.services.sort(), t.spanCount, t.logs.map((l) => l.message)]).toEqual([["api-rest", "console"], 2, ["from the api"]]);
    // The owner also belongs to org B, but a trace opened in org A stays in org A, and the other way round.
    const b = (await owner.call<Trace>("GET", `api/traces/${T1}?project=${pb}`)).body;
    expect([b.services, b.logs.map((l) => l.message)]).toEqual([["intruder"], ["other tenant"]]);
  });

  it("returns only the asked project with join=false", async () => {
    expect((await owner.call<Trace>("GET", `api/traces/${T1}?project=${pa1}&join=false`)).body.services).toEqual(["console"]);
  });

  it("is a 404 when the asked project has no part of the trace", async () => {
    expect((await owner.call("GET", `api/traces/${T2}?project=${pa1}`)).status).toBe(404);
  });

});

describe("who sees the joined parts", () => {
  it("gives a person of another tenant nothing from org A", async () => {
    const eve = await joinWithInvite(url, await invite(owner, orgB, "eve@beta.io", "admin"), "eve@beta.io", "Eve");
    expect((await eve.call<Trace>("GET", `api/traces/${T1}?project=${pb}`)).body.services).toEqual(["intruder"]);
    expect((await eve.call("GET", `api/traces/${T1}?project=${pa1}`)).status).toBe(404);
  });

  it("joins only the projects a read key holds", async () => {
    const one = await key(orgA, "read", [pa1]);
    expect(((await (await byKey(one, T1, pa1)).json()) as Trace).services).toEqual(["console"]);
    const both = await key(orgA, "read", [pa1, pa2]);
    expect(((await (await byKey(both, T1, pa1)).json()) as Trace).services.sort()).toEqual(["api-rest", "console"]);
  });

  it("drops a project of another organization even when a read key names it", async () => {
    const token = await key(orgB, "read", [pb]);
    // Simulate a key row that names a project of org A (a bug or a tampered row): the join must still stay in org B.
    await cloud.app.db.query("UPDATE api_keys SET project_ids = $1 WHERE org_id = $2 AND kind = 'read'", [JSON.stringify([pb, pa1, pa2]), orgB]);
    expect(((await (await byKey(token, T1, pb)).json()) as Trace).services).toEqual(["intruder"]);
    expect((await byKey(token, T1, pa1)).status).toBe(404);
  });

  it("joins MCP get_trace only as far as the read key reaches", async () => {
    const one = await key(orgA, "read", [pa1]);
    const res = await fetch(`${url}/_wizelens/mcp?project=${pa1}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${one}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_trace", arguments: { traceId: T1 } } }),
    });
    const text = ((await res.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text;
    expect([text.includes("console"), text.includes("api-rest"), text.includes("intruder")]).toEqual([true, false, false]);
  });

  it("joins a share link as far as its maker may read, and stops when the maker leaves", async () => {
    const vic = await joinWithInvite(url, await invite(owner, orgA, "vic@acme.io", "member"), "vic@acme.io");
    const made = await vic.call<{ url: string }>("POST", `api/projects/${pa1}/shares`, { traceId: T1, days: 3 });
    const token = made.body.url.split("/shared/")[1]!;
    const shared = async () => (await new Client(url).call<{ trace: Trace }>("GET", `api/shared/${token}`)).body.trace.services.sort();
    expect(await shared()).toEqual(["api-rest", "console"]);
    expect((await owner.call("POST", "api/auth/organization/remove-member", { memberIdOrEmail: "vic@acme.io", organizationId: orgA })).status).toBe(200);
    expect(await shared()).toEqual(["console"]);
  });
});
