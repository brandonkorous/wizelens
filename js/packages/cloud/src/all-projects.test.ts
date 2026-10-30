import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Span } from "@wizeworks/lens-core/internal";
import type { Cloud } from "./server.js";
import { Client, invite, joinWithInvite, type Me, setupOwner, startCloud } from "./test/cloud.js";
import { span } from "./test/db.js";

type Rows = { rows: { name?: string; service?: string; project?: string }[]; total?: number };

let cloud: Cloud;
let url: string;
let owner: Client;
// Org A: Shop (pa1) and Admin (pa2), both with a service called "api". Org B (pb) has one too.
let orgA: string, orgB: string, pa1: string, pa2: string, pb: string, shop: string;

const key = async (org: string, kind: "ingest" | "read", projectIds: string[]) =>
  (await owner.call<{ token: string }>("POST", `api/orgs/${org}/keys`, { kind, projectIds })).body.token;

async function send(token: string, spans: Span[]) {
  const res = await fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ sender: { service: "api" }, spans }) });
  expect(res.status).toBe(204);
}

/** One request to "api", in its own trace. */
const request = (n: number, at: number, path: string) => span(String(n).repeat(32).slice(0, 32), String(n).repeat(16).slice(0, 16), { service: "api", category: "http.server", startMs: at, attributes: { "http.request.method": "GET", "url.path": path, "http.response.status_code": 200 } });

const all = (org: string) => `project=all&org=${org}`;

beforeEach(async () => {
  ({ cloud, url } = await startCloud());
  ({ owner, orgId: orgA, projectId: pa1 } = await setupOwner(cloud, url));
  pa2 = (await owner.call<{ id: string }>("POST", `api/orgs/${orgA}/projects`, { name: "Admin" })).body.id;
  orgB = (await owner.call<{ id: string }>("POST", "api/orgs", { name: "Beta" })).body.id;
  const me = (await owner.call<Me>("GET", "api/me")).body;
  pb = me.orgs.find((o) => o.id === orgB)!.projects[0]!.id;
  shop = me.orgs.find((o) => o.id === orgA)!.projects.find((p) => p.id === pa1)!.name;
  const at = Date.now() - 60_000;
  await send(await key(orgA, "ingest", [pa1]), [request(1, at, "/cart")]);
  await send(await key(orgA, "ingest", [pa2]), [request(2, at, "/users"), request(3, at + 1, "/users")]);
  await send(await key(orgB, "ingest", [pb]), [request(4, at, "/secret")]);
  await cloud.app.telemetry.settle(Date.now() + 60_000, { budgetMs: Number.POSITIVE_INFINITY });
});

afterEach(async () => {
  await cloud?.close();
});

describe("All projects", () => {
  it("lists every project's services apart, and nothing from another organization", async () => {
    const services = (await owner.call<Rows>("GET", `api/models/services?${all(orgA)}&range=1h`)).body;
    expect(services.rows.map((r) => r.name).sort()).toEqual([`api · ${shop}`, "api · Admin"].sort());
    const b = (await owner.call<Rows>("GET", `api/models/services?${all(orgB)}&range=1h`)).body;
    // One project in org B: nothing to tell apart, so no label.
    expect(b.rows.map((r) => r.name)).toEqual(["api"]);
  });

  it("adds up across projects, and a labeled service reads its project only", async () => {
    const requests = (await owner.call<Rows>("GET", `api/models/requests?${all(orgA)}&range=1h`)).body;
    expect(requests.total).toBe(3);
    expect(new Set(requests.rows.map((r) => r.project))).toEqual(new Set([shop, "Admin"]));
    const admin = (await owner.call<Rows>("GET", `api/models/requests?${all(orgA)}&range=1h&service=${encodeURIComponent("api · Admin")}`)).body;
    expect([admin.total, admin.rows.every((r) => r.project === "Admin")]).toEqual([2, true]);
    const traces = (await owner.call<unknown[]>("GET", `api/traces?${all(orgA)}`)).body;
    expect(traces).toHaveLength(3);
  });

  it("holds people to their projects and keys to theirs", async () => {
    const vic = await joinWithInvite(url, await invite(owner, orgA, "vic@acme.io", "member"), "vic@acme.io");
    const vicId = (await vic.call<Me>("GET", "api/me")).body.user!.id;
    expect((await owner.call("PUT", `api/orgs/${orgA}/projects/${pa2}/roles/${vicId}`, { role: "none" })).status).toBe(200);
    const seen = (await vic.call<Rows>("GET", `api/models/requests?${all(orgA)}&range=1h`)).body;
    expect([seen.total, seen.rows.map((r) => r.service)]).toEqual([1, ["api"]]);
    expect((await vic.call("GET", `api/models/requests?${all(orgB)}&range=1h`)).status).toBe(404);
    const read = await key(orgA, "read", [pa2]);
    const res = await fetch(`${url}/_wizelens/api/models/requests?${all(orgA)}&range=1h`, { headers: { Authorization: `Bearer ${read}` } });
    expect(((await res.json()) as Rows).total).toBe(2);
    const other = await fetch(`${url}/_wizelens/api/models/requests?${all(orgB)}&range=1h`, { headers: { Authorization: `Bearer ${read}` } });
    expect(other.status).toBe(404);
  });

  it("asks for the organization", async () => {
    expect((await owner.call("GET", "api/models/requests?project=all&range=1h")).status).toBe(400);
  });
});
