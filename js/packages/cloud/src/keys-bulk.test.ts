import { afterEach, describe, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { type Client, invite, joinWithInvite, setupOwner, startCloud } from "./test/cloud.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

async function threeKeys(owner: Client, orgId: string, projectId: string): Promise<{ id: string; token: string }[]> {
  const make = (name: string) => owner.call<{ id: string; token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", name, projectIds: [projectId] });
  return [(await make("a")).body, (await make("b")).body, (await make("c")).body];
}

const send = (url: string, token: string) =>
  fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ sender: { service: "s", environment: "prod" }, spans: [] }) });

describe("many keys at once", () => {
  it("rotates many keys: new secrets once, the old ones end after the grace period", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const [a, b] = await threeKeys(owner, orgId, projectId);
    const res = await owner.call<{ keys: { oldId: string; token: string; name: string; oldExpiresMs: number }[]; missing: string[] }>("POST", `api/orgs/${orgId}/keys/rotate`, { keyIds: [a!.id, b!.id, "gone"], graceHours: 0 });
    expect(res.status).toBe(201);
    expect(res.body.keys.map((k) => k.name).sort()).toEqual(["a", "b"]);
    expect(res.body.missing).toEqual(["gone"]);
    expect((await send(url, a!.token)).status).toBe(401);
    expect((await send(url, res.body.keys[0]!.token)).status).toBe(204);
    const audit = (await owner.call<{ action: string; detail: { keyIds: string[] } }[]>("GET", `api/orgs/${orgId}/audit`)).body;
    expect(audit.find((e) => e.action === "key.rotate_many")?.detail.keyIds.sort()).toEqual([a!.id, b!.id].sort());
  });

  it("revokes many keys and leaves the rest", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const [a, b, c] = await threeKeys(owner, orgId, projectId);
    const res = await owner.call<{ revoked: string[]; missing: string[] }>("POST", `api/orgs/${orgId}/keys/revoke`, { keyIds: [a!.id, b!.id, b!.id] });
    expect(res.body.revoked.sort()).toEqual([a!.id, b!.id].sort());
    expect((await send(url, a!.token)).status).toBe(401);
    expect((await send(url, c!.token)).status).toBe(204);
    const again = await owner.call<{ revoked: string[]; missing: string[] }>("POST", `api/orgs/${orgId}/keys/revoke`, { keyIds: [a!.id] });
    expect(again.body).toEqual({ revoked: [], missing: [a!.id] });
    expect((await owner.call("POST", `api/orgs/${orgId}/keys/revoke`, { keyIds: [] })).status).toBe(400);
    expect((await owner.call("POST", `api/orgs/${orgId}/keys/rotate`, { keyIds: [c!.id], graceHours: 500 })).status).toBe(400);
  });

  it("is for owners and admins only", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const [a] = await threeKeys(owner, orgId, projectId);
    const member = await joinWithInvite(url, await invite(owner, orgId, "mo@acme.io", "member"), "mo@acme.io");
    expect((await member.call("POST", `api/orgs/${orgId}/keys/revoke`, { keyIds: [a!.id] })).status).toBe(403);
    expect((await member.call("POST", `api/orgs/${orgId}/keys/rotate`, { keyIds: [a!.id] })).status).toBe(403);
  });
});
