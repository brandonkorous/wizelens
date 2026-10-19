import { getMigrations } from "better-auth/db/migration";
import { afterEach, describe, expect, it } from "vitest";
import { dayOf } from "./billing/usage.js";
import { overageCents } from "./billing/plans.js";
import { setPlan } from "./repo/billing.js";
import type { Cloud } from "./server.js";
import { type Client, type Me, setupOwner, startCloud } from "./test/cloud.js";
import { billedOptions, fakeStripe } from "./test/stripe.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

type Usage = { billing: boolean; plan: { id: string }; monthGb: number; includedGb: number | null; blocked: string | null; overageUsd: number; projectedGb: number; days: unknown[] };

const ingestKey = async (owner: Client, orgId: string, projectId: string) => (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
const send = (url: string, token: string, body: unknown = { sender: { service: "shop" }, spans: [], logs: [] }) =>
  fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const useGb = (orgId: string, gb: number, day = dayOf(Date.now())) =>
  cloud.app.db.query("INSERT INTO usage_daily (org_id, day, bytes) VALUES ($1, $2, $3) ON CONFLICT (org_id, day) DO UPDATE SET bytes = usage_daily.bytes + EXCLUDED.bytes", [orgId, day, gb * 1e9]);

describe("plans", () => {
  it("bills extra GB in graduated tiers on the GB above the included GB", () => {
    expect([overageCents(0), overageCents(-3), overageCents(10), overageCents(500), overageCents(600), overageCents(2000), overageCents(2100)]).toEqual([0, 0, 300, 15000, 17000, 45000, 46000]);
  });
});

describe("billing off (no Stripe key)", () => {
  it("makes every organization unlimited, counts usage, and gates nothing", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const me = (await owner.call<Me & { billing: boolean; orgs: { plan: string }[] }>("GET", "api/me")).body;
    expect([me.billing, me.orgs[0]!.plan]).toEqual([false, "unlimited"]);
    const token = await ingestKey(owner, orgId, projectId);
    await useGb(orgId, 5000);
    expect((await send(url, token)).status).toBe(204);
    await cloud.app.billing.usage.flush();
    const u = (await owner.call<Usage>("GET", `api/orgs/${orgId}/usage`)).body;
    expect([u.billing, u.plan.id, u.includedGb, u.blocked]).toEqual([false, "unlimited", null, null]);
    expect((u.days as { bytes: number }[])[0]!.bytes).toBeGreaterThan(5000e9);
    expect((await owner.call("PATCH", `api/orgs/${orgId}`, { retentionDays: 400 })).status).toBe(200);
    expect((await owner.call("GET", `api/orgs/${orgId}/audit/export?format=csv`)).status).toBe(200);
    expect((await owner.call("POST", `api/orgs/${orgId}/scim/tokens`, { name: "Okta" })).status).toBe(201);
  });

  it("refuses half a Stripe setup", async () => {
    await expect(startCloud({ stripeWebhookSecret: "whsec_x" })).rejects.toThrow(/need --stripe-secret-key/);
    await expect(startCloud({ stripeSecretKey: "sk_test_x", stripeWebhookSecret: "whsec_x", publicUrl: "http://127.0.0.1:1" })).rejects.toThrow(/--stripe-prices/);
  });
});

describe("billing on", () => {
  it("finds nothing to change in our schema with the Stripe plugin on", async () => {
    ({ cloud } = await startCloud(await billedOptions(fakeStripe())));
    const m = await getMigrations(cloud.app.auth.options);
    expect({ create: m.toBeCreated, add: m.toBeAdded, indexes: m.toBeAddedIndexes, problems: m.schemaProblems }).toEqual({ create: [], add: [], indexes: [], problems: [] });
  });

});

describe("billing on: plans", () => {
  it("starts new organizations on Free: 14 days, gated features answer 402 with the plan", async () => {
    let url: string;
    ({ cloud, url } = await startCloud(await billedOptions(fakeStripe())));
    const { owner, orgId } = await setupOwner(cloud, url);
    const me = (await owner.call<{ billing: boolean; orgs: { plan: string; retentionDays: number }[] }>("GET", "api/me")).body;
    expect([me.billing, me.orgs[0]!.plan, me.orgs[0]!.retentionDays]).toEqual([true, "free", 14]);
    const long = await owner.call<{ plan: string }>("PATCH", `api/orgs/${orgId}`, { retentionDays: 30 });
    expect([long.status, long.body.plan]).toEqual([402, "team"]);
    const exp = await owner.call<{ plan: string; error: string }>("GET", `api/orgs/${orgId}/audit/export`);
    expect([exp.status, exp.body.plan]).toEqual([402, "business"]);
    expect((await owner.call("POST", `api/orgs/${orgId}/scim/tokens`, {})).status).toBe(402);
    const sso = await owner.call<{ code: string }>("POST", "api/auth/sso/register", { providerId: "okta", issuer: "https://acme.okta.com", domain: "acme.io", organizationId: orgId, oidcConfig: { clientId: "x", clientSecret: "y", pkce: true } });
    expect([sso.status, sso.body.code]).toEqual([402, "PLAN_REQUIRED"]);
    await setPlan(cloud.app.db, orgId, { plan: "business" }, "test", Date.now());
    expect((await owner.call("GET", `api/orgs/${orgId}/audit/export?format=json`)).status).toBe(200);
    expect((await owner.call("PATCH", `api/orgs/${orgId}`, { retentionDays: 90 })).status).toBe(200);
    await setPlan(cloud.app.db, orgId, { plan: "free" }, "test", Date.now());
    expect((await owner.call<Me & { orgs: { retentionDays: number }[] }>("GET", "api/me")).body.orgs[0]!.retentionDays).toBe(14);
  });

});

describe("billing on: limits", () => {
  it("stops Free ingest at 10 GB with a 429, and writes one audit line a month", async () => {
    let url: string;
    ({ cloud, url } = await startCloud(await billedOptions(fakeStripe())));
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const token = await ingestKey(owner, orgId, projectId);
    expect((await send(url, token)).status).toBe(204);
    await useGb(orgId, 10);
    cloud.app.billing.forget(orgId);
    await cloud.app.billing.usage.flush();
    const res = await send(url, token);
    expect([res.status, res.headers.get("retry-after")]).toEqual([429, "3600"]);
    expect(((await res.json()) as { error: string }).error).toMatch(/^This organization reached the Free plan's 10 GB for this month\./);
    await send(url, token);
    const audit = (await owner.call<{ action: string }[]>("GET", `api/orgs/${orgId}/audit`)).body.filter((a) => a.action === "ingest.blocked");
    expect(audit).toHaveLength(1);
    expect((await owner.call<Usage>("GET", `api/orgs/${orgId}/usage`)).body.blocked).toMatch(/Free plan/);
  });

  it("stops Team ingest at the owner's spend cap, and counts overage in tiers", async () => {
    let url: string;
    ({ cloud, url } = await startCloud(await billedOptions(fakeStripe())));
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    expect((await owner.call("PATCH", `api/orgs/${orgId}/billing`, { spendCapUsd: 5 })).status).toBe(400);
    await setPlan(cloud.app.db, orgId, { plan: "team" }, "test", Date.now());
    expect((await owner.call("PATCH", `api/orgs/${orgId}/billing`, { spendCapUsd: 5 })).status).toBe(200);
    await useGb(orgId, 60);
    await cloud.app.billing.usage.flush();
    expect((await owner.call<Usage>("GET", `api/orgs/${orgId}/usage`)).body.overageUsd).toBe(3);
    expect((await send(url, await ingestKey(owner, orgId, projectId))).status).toBe(204);
    await useGb(orgId, 10);
    await cloud.app.billing.usage.flush();
    const res = await send(url, await ingestKey(owner, orgId, projectId));
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toMatch(/spend cap of \$5/);
  });
});
