import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dayOf } from "./billing/usage.js";
import type { Cloud } from "./server.js";
import { type Client, invite, joinWithInvite, PASSWORD, setupOwner, startCloud } from "./test/cloud.js";
import { billedOptions, type FakeStripe, fakeStripe, PRICES } from "./test/stripe.js";

let cloud: Cloud;
let url: string;
let fake: FakeStripe;
let owner: Client;
let orgId: string;

beforeEach(async () => {
  fake = fakeStripe();
  ({ cloud, url } = await startCloud(await billedOptions(fake)));
  ({ owner, orgId } = await setupOwner(cloud, url));
});
afterEach(async () => {
  await cloud?.close();
});

const upgrade = (who: Client, body: Record<string, unknown> = {}) =>
  who.call<{ url: string }>("POST", "api/auth/subscription/upgrade", { plan: "team", customerType: "organization", referenceId: orgId, successUrl: "/_wizelens/#/team/billing", cancelUrl: "/_wizelens/#/team/billing", disableRedirect: true, ...body });

/** Post one signed event to the webhook, as Stripe does. */
async function deliver(type: string, object: unknown, header?: string): Promise<number> {
  const signed = fake.sign(type, object);
  const res = await fetch(`${url}/_wizelens/api/auth/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header ?? signed.header }, body: signed.payload });
  return res.status;
}

const planOf = async () => (await cloud.app.db.query<{ plan: string }>("SELECT plan FROM orgs WHERE id = $1", [orgId]))[0]!.plan;

/** Checkout, then Stripe's checkout.session.completed: the organization is on Team. */
async function buyTeam(): Promise<{ subId: string; customer: string }> {
  expect((await upgrade(owner)).body.url).toBe("https://checkout.stripe.test/cs_1");
  const [row] = await cloud.app.db.query<{ id: string; stripe_customer_id: string }>("SELECT id, stripe_customer_id FROM subscriptions WHERE reference_id = $1", [orgId]);
  const sub = fake.newSub(row!.stripe_customer_id, PRICES.teamMonthly, { subscriptionId: row!.id, referenceId: orgId });
  expect(await deliver("checkout.session.completed", { id: "cs_1", mode: "subscription", subscription: sub.id, client_reference_id: orgId, metadata: { subscriptionId: row!.id, referenceId: orgId } })).toBe(200);
  return { subId: sub.id, customer: row!.stripe_customer_id };
}

describe("Stripe checkout and webhooks", () => {
  it("lets only owners and admins start a plan, and only for the organization", async () => {
    expect((await upgrade(owner, { customerType: undefined, referenceId: undefined })).status).toBe(400);
    const vic = await joinWithInvite(url, await invite(owner, orgId, "vic@acme.io", "member"), "vic@acme.io");
    expect((await upgrade(vic)).status).toBe(401);
    expect((await upgrade(owner)).status).toBe(200);
    const customer = fake.called("customers.create")[0]!.args[0] as { metadata: Record<string, string> };
    expect(customer.metadata.wizelensOrgId).toBe(orgId);
    expect(fake.called("checkout.sessions.create")).toHaveLength(1);
  });

  it("sets the plan from the webhook and starts the usage subscription on the 1st", async () => {
    const { customer } = await buyTeam();
    expect(await planOf()).toBe("team");
    const [create] = fake.called("subscriptions.create");
    const [params, opts] = create!.args as [Record<string, unknown>, { idempotencyKey: string }];
    expect(params).toMatchObject({ customer, items: [{ price: PRICES.overage }], proration_behavior: "none", default_payment_method: "pm_card", metadata: { wizelensOrgId: orgId, wizelensRole: "usage" } });
    expect(new Date((params.billing_cycle_anchor as number) * 1000).getUTCDate()).toBe(1);
    expect(opts.idempotencyKey).toMatch(/^wl-usage-/);
    const audit = (await owner.call<{ action: string; detail: { plan: string } }[]>("GET", `api/orgs/${orgId}/audit`)).body.find((a) => a.action === "plan.change");
    expect(audit?.detail.plan).toBe("team");
  });

  it("reports GB above the included GB once per day, so a rerun never bills twice", async () => {
    await buyTeam();
    const yesterday = dayOf(Date.now() - 86_400_000 - 10 * 60_000);
    await cloud.app.db.query("INSERT INTO usage_daily (org_id, day, bytes) VALUES ($1, $2, $3)", [orgId, yesterday, 60.7e9]);
    await cloud.app.billing.report!();
    await cloud.app.billing.report!();
    expect(fake.meterEvents).toEqual([expect.objectContaining({ event_name: "wizelens_gb", identifier: `wl-${orgId}-${yesterday}`, payload: expect.objectContaining({ value: "10" }) })]);
  });

  it("makes the usage subscription again when someone ends it, and drops to Free when the plan ends", async () => {
    const { subId } = await buyTeam();
    const usageId = (await cloud.app.db.query<{ id: string }>("SELECT overage_subscription_id AS id FROM orgs WHERE id = $1", [orgId]))[0]!.id;
    fake.subs.get(usageId)!.status = "canceled";
    expect(await deliver("customer.subscription.deleted", fake.subs.get(usageId))).toBe(200);
    expect(fake.called("subscriptions.create")).toHaveLength(2);
    expect(await planOf()).toBe("team");
    expect((await owner.call("DELETE", `api/orgs/${orgId}`, { password: PASSWORD })).status).toBe(409);
    fake.subs.get(subId)!.status = "canceled";
    expect(await deliver("customer.subscription.deleted", fake.subs.get(subId))).toBe(200);
    expect(await planOf()).toBe("free");
    expect(fake.called("subscriptions.cancel")).toHaveLength(1);
  });

  it("refuses an event without a valid signature", async () => {
    expect(await deliver("customer.subscription.deleted", { id: "sub_x" }, "t=1,v1=bad")).toBe(400);
  });
});
