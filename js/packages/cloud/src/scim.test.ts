import { afterEach, describe, expect, it } from "vitest";
import { setPlan } from "./repo/billing.js";
import type { Cloud } from "./server.js";
import { type Client, setupOwner, startCloud } from "./test/cloud.js";
import { billedOptions, fakeStripe } from "./test/stripe.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

const scim = (url: string, token: string, method: string, path: string, body?: unknown) =>
  fetch(`${url}/_wizelens/api/auth/scim/v2/${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/scim+json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const USER = { schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"], userName: "ann@acme.io", externalId: "okta-1", name: { givenName: "Ann", familyName: "Lee" }, emails: [{ value: "ann@acme.io", primary: true }], active: true };

const members = async (owner: Client, orgId: string) => (await owner.call<{ members: { email: string }[] }>("GET", `api/orgs/${orgId}`)).body.members.map((m) => m.email).sort();

async function newToken(owner: Client, orgId: string): Promise<string> {
  const res = await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/scim/tokens`, { name: "Okta" });
  expect(res.status).toBe(201);
  return res.body.token;
}

describe("SCIM provisioning", () => {
  it("adds people the identity provider creates, and removes them when it deactivates them", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId } = await setupOwner(cloud, url);
    const token = await newToken(owner, orgId);
    const made = await scim(url, token, "POST", "Users", USER);
    expect(made.status).toBe(201);
    const id = ((await made.json()) as { id: string }).id;
    expect(await members(owner, orgId)).toEqual(["ann@acme.io", "owner@acme.io"]);
    const off = await scim(url, token, "PATCH", `Users/${id}`, { schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations: [{ op: "replace", path: "active", value: false }] });
    expect(off.status).toBe(200);
    expect(await members(owner, orgId)).toEqual(["owner@acme.io"]);
    const log = (await owner.call<{ action: string; detail: Record<string, unknown> }[]>("GET", `api/orgs/${orgId}/audit`)).body;
    expect(log.map((a) => a.action)).toEqual(expect.arrayContaining(["scim.token.create", "scim.user.create", "scim.user.update"]));
    expect(log.find((a) => a.action === "scim.user.update")?.detail).toMatchObject({ userName: "ann@acme.io", active: false });
    expect((await scim(url, token, "DELETE", `Users/${id}`)).status).toBe(204);
    const del = (await owner.call<{ action: string; detail: Record<string, unknown> }[]>("GET", `api/orgs/${orgId}/audit`)).body.find((a) => a.action === "scim.user.delete");
    expect(del?.detail).toMatchObject({ userName: "ann@acme.io", id });
  });

  it("refuses a revoked token, and tokens of an organization whose plan has no SCIM", async () => {
    let url: string;
    ({ cloud, url } = await startCloud(await billedOptions(fakeStripe())));
    const { owner, orgId } = await setupOwner(cloud, url);
    await setPlan(cloud.app.db, orgId, { plan: "business" }, "test", Date.now());
    const token = await newToken(owner, orgId);
    expect((await scim(url, token, "GET", "Users")).status).toBe(200);
    await setPlan(cloud.app.db, orgId, { plan: "team" }, "test", Date.now());
    expect((await scim(url, token, "GET", "Users")).status).toBe(401);
    await setPlan(cloud.app.db, orgId, { plan: "business" }, "test", Date.now());
    const list = await owner.call<{ tokens: { id: string }[]; allowed: boolean }>("GET", `api/orgs/${orgId}/scim`);
    expect(list.body.allowed).toBe(true);
    expect((await owner.call("DELETE", `api/orgs/${orgId}/scim/tokens/${list.body.tokens[0]!.id}`)).status).toBe(200);
    expect((await scim(url, token, "GET", "Users")).status).toBe(401);
  });
});
