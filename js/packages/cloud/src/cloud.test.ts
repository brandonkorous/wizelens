import { afterEach, describe, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { Client, invite, joinWithInvite, type Me, PASSWORD, setupOwner, startCloud } from "./test/cloud.js";
import { span, T1 } from "./test/db.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

async function ingestKey(owner: Client, orgId: string, projectId: string): Promise<string> {
  return (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", name: "api", projectIds: [projectId] })).body.token;
}

describe("cloud accounts", () => {
  it("sets up once with the setup token, then needs sign-in", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    expect((await new Client(url).call<Me>("GET", "api/me")).body).toMatchObject({ signedIn: false, needsSetup: true });
    const { owner } = await setupOwner(cloud, url);
    expect((await owner.call<Me>("GET", "api/me")).body.orgs[0]).toMatchObject({ role: "owner", projects: [{ name: "My app" }] });
    expect(cloud.setupLink()).toBeNull();
    const stranger = await new Client(url).call("POST", "api/auth/sign-up/email", { email: "x@y.io", password: PASSWORD, name: "X" });
    expect(stranger.status).toBe(403);
  });

  it("invites a viewer who can read but not manage", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId } = await setupOwner(cloud, url);
    const id = await invite(owner, orgId, "vic@acme.io", "viewer");
    const vic = await joinWithInvite(url, id, "vic@acme.io");
    expect((await vic.call<{ role: string }>("GET", `api/orgs/${orgId}`)).body.role).toBe("viewer");
    expect((await vic.call("POST", `api/orgs/${orgId}/projects`, { name: "Nope" })).status).toBe(403);
    expect((await vic.call("POST", "api/auth/organization/invite-member", { email: "z@acme.io", role: "viewer", organizationId: orgId })).status).toBe(403);
    const audit = (await owner.call<{ action: string }[]>("GET", `api/orgs/${orgId}/audit`)).body.map((a) => a.action);
    expect(audit).toEqual(expect.arrayContaining(["member.invite", "member.join", "org.create"]));
  });

  it("refuses changes without the dashboard header", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId } = await setupOwner(cloud, url);
    expect((await owner.call("POST", `api/orgs/${orgId}/projects`, { name: "X" }, { "X-WizeLens-Client": "" })).status).toBe(403);
    expect((await owner.call("POST", "api/auth/sign-out", {}, { "X-WizeLens-Client": "" })).status).toBe(403);
  });
});

describe("cloud data", () => {
  it("takes batches with an ingest key and serves them to members only", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const key = await ingestKey(owner, orgId, projectId);
    const batch = { sender: { service: "orders-api", environment: "prod" }, spans: [span(T1, "1".repeat(16))] };
    const send = (auth: string) => fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${auth}` }, body: JSON.stringify(batch) });
    expect((await send("wl_ik_wrong")).status).toBe(401);
    expect((await send(key)).status).toBe(204);
    const list = await owner.call<{ traceId: string }[]>("GET", `api/traces?project=${projectId}`);
    expect(list.body.map((t) => t.traceId)).toEqual([T1]);
    expect((await owner.call("GET", `api/traces/${T1}?project=${projectId}`)).status).toBe(200);
    expect((await new Client(url).call("GET", `api/traces?project=${projectId}`)).status).toBe(401);
    const services = await owner.call<{ services: { service: string }[]; environments: string[] }>("GET", `api/services?project=${projectId}`);
    expect(services.body).toMatchObject({ services: [{ service: "orders-api" }], environments: ["prod"] });
  });

  it("lets a read key read only its projects", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const other = (await owner.call<{ id: string }>("POST", `api/orgs/${orgId}/projects`, { name: "Other" })).body.id;
    const read = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "read", projectIds: [projectId] })).body.token;
    const get = (p: string) => fetch(`${url}/_wizelens/api/traces?project=${p}`, { headers: { Authorization: `Bearer ${read}` } });
    expect((await get(projectId)).status).toBe(200);
    expect((await get(other)).status).toBe(404);
  });

  it("takes OTLP with an ingest key", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const key = await ingestKey(owner, orgId, projectId);
    const body = { resourceSpans: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: "py" } }] }, scopeSpans: [{ spans: [{ traceId: T1, spanId: "1".repeat(16), name: "work", startTimeUnixNano: "1000000000", endTimeUnixNano: "2000000000" }] }] }] };
    const res = await fetch(`${url}/v1/traces`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    expect((await owner.call<{ spans: unknown[] }>("GET", `api/traces/${T1}?project=${projectId}`)).body.spans).toHaveLength(1);
  });
});
