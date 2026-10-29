import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { planMain, stripeSetupMain } from "./billing/cli.js";
import { sendUsageNotices } from "./billing/notices.js";
import { stripeSetup, TAX_CODE } from "./billing/stripe-setup.js";
import { dayOf } from "./billing/usage.js";
import type { StripeClient } from "./billing/options.js";
import type { Cloud } from "./server.js";
import { Client, type Me, mailbox, PASSWORD, setupOwner, startCloud } from "./test/cloud.js";
import { billedOptions, fakeStripe } from "./test/stripe.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

const useGb = (orgId: string, gb: number) =>
  cloud.app.db.query("INSERT INTO usage_daily (org_id, day, bytes) VALUES ($1, $2, $3) ON CONFLICT (org_id, day) DO UPDATE SET bytes = EXCLUDED.bytes", [orgId, dayOf(Date.now()), gb * 1e9]);

describe("usage mail", () => {
  it("tells owners at 80% and at 100% of the Free GB, once each a month", async () => {
    const mail = mailbox();
    let url: string;
    ({ cloud, url } = await startCloud(await billedOptions(fakeStripe(), { sendMail: mail.sendMail })));
    const c = new Client(url);
    const token = new URL(cloud.setupLink()!.replace("#/", "")).searchParams.get("token")!;
    await c.call("POST", "api/auth/sign-up/email", { email: "ann@acme.io", password: PASSWORD, name: "Ann" }, { "x-wizelens-setup-token": token });
    await c.call("GET", `api/auth/verify-email?token=${mail.token("ann@acme.io")}`);
    const orgId = (await c.call<Me>("GET", "api/me")).body.orgs[0]!.id;
    const usage = () => mail.sent.filter((m) => m.kind === "billing").map((m) => m.subject);
    await useGb(orgId, 8.5);
    await sendUsageNotices(cloud.app);
    await sendUsageNotices(cloud.app);
    await useGb(orgId, 10.2);
    await cloud.app.billing.usage.flush();
    await sendUsageNotices(cloud.app);
    await new Promise((r) => setTimeout(r, 200));
    expect(usage()).toEqual([expect.stringMatching(/used 80%/), expect.stringMatching(/used 100%/)]);
    // The link opens this organization's billing, for a person in several.
    expect(mail.sent.find((m) => m.kind === "billing")?.text).toContain(`#/organization/billing?org=${orgId}`);
  });
});

describe("usage counting", () => {
  it("counts the body as sent: a gzip body counts its compressed size", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const token = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
    const body = gzipSync(JSON.stringify({ sender: { service: "shop" }, spans: [], logs: [], pad: "x".repeat(50_000) }));
    const res = await fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Encoding": "gzip" }, body });
    expect(res.status).toBe(204);
    await cloud.app.billing.usage.flush();
    const [row] = await cloud.app.db.query<{ bytes: number }>("SELECT bytes FROM usage_daily WHERE org_id = $1", [orgId]);
    expect(Number(row!.bytes)).toBe(body.length);
  });
});

type FakeProduct = { id: string; key: string; tax_code: string | null };
type FakePrice = { id: string; lookup_key: string; tax_behavior: string; params: Record<string, unknown> };

/** A fake Stripe for the setup command: what it made, and lists that return it on the next run. */
function setupFake(tax = "active") {
  const made: string[] = [];
  const meters: { id: string; event_name: string }[] = [];
  const products: FakeProduct[] = [];
  const prices: FakePrice[] = [];
  const hooks: { url: string }[] = [];
  // Stripe's default portal: no plan switches until stripe-setup turns them on.
  const portal = { id: "bpc_1", features: { subscription_update: { enabled: false, products: [] as { product: string; prices: string[] }[] }, subscription_cancel: { enabled: false } } };
  const list = <T>(rows: T[]) => async function* () { yield* rows; };
  const client = {
    billing: { meters: { list: () => list(meters)(), create: async (p: { event_name: string }) => (made.push("meter"), meters.push({ id: "mtr_1", event_name: p.event_name }), meters[0]) } },
    products: {
      search: async (p: { query: string }) => ({ data: products.filter((x) => p.query.includes(`'${x.key}'`)) }),
      create: async (p: { tax_code: string; metadata: { wizelens: string } }) => (made.push(`product ${p.metadata.wizelens}`), products.push({ id: `prod_${p.metadata.wizelens}`, key: p.metadata.wizelens, tax_code: p.tax_code }), products.at(-1)),
      update: async (id: string, p: { tax_code: string }) => Object.assign(products.find((x) => x.id === id)!, p),
    },
    prices: {
      list: async () => ({ data: prices }),
      create: async (p: Record<string, unknown>) => (made.push(`price ${p.lookup_key}`), prices.push({ id: `price_${prices.length}`, lookup_key: p.lookup_key as string, tax_behavior: p.tax_behavior as string, params: p }), prices.at(-1)),
      update: async (id: string, p: { tax_behavior: string }) => Object.assign(prices.find((x) => x.id === id)!, p),
    },
    tax: { settings: { retrieve: async () => ({ status: tax }) } },
    webhookEndpoints: { list: () => list(hooks)(), create: async (p: { url: string }) => (made.push("webhook"), hooks.push(p), { secret: "whsec_new" }) },
    billingPortal: {
      configurations: {
        list: async () => ({ data: [portal] }),
        update: async (_id: string, p: { features: unknown }) => (made.push("portal"), (portal.features = p.features as typeof portal.features), portal),
      },
    },
  };
  return { client: client as unknown as StripeClient, made, products, prices, portal };
}

describe("stripe-setup", () => {
  it("makes the meter, products, prices, and webhook once, then reuses them", async () => {
    const f = setupFake();
    const first = await stripeSetup(f.client, "https://app.wizelens.com");
    expect(first.webhookUrl).toBe("https://app.wizelens.com/_wizelens/api/auth/stripe/webhook");
    expect(first.webhookSecret).toBe("whsec_new");
    expect(Object.keys(first.prices).sort()).toEqual(["businessAnnual", "businessMonthly", "meter", "overage", "teamAnnual", "teamMonthly"]);
    const overage = f.prices.find((p) => p.lookup_key === "wizelens_gb_overage")!.params;
    expect(overage).toMatchObject({ tiers_mode: "graduated", recurring: { interval: "month", usage_type: "metered", meter: "mtr_1" }, tiers: [{ up_to: 500, unit_amount: 30 }, { up_to: 2000, unit_amount: 20 }, { up_to: "inf", unit_amount: 10 }] });
    expect(f.prices.find((p) => p.lookup_key === "wizelens_team_annual")!.params).toMatchObject({ unit_amount: 29000, recurring: { interval: "year" } });
    expect(f.products.every((p) => p.tax_code === TAX_CODE) && f.prices.every((p) => p.tax_behavior === "exclusive")).toBe(true);
    expect(first.taxReady).toBe(true);
    expect(f.portal.features.subscription_update).toMatchObject({ enabled: true, products: [{ product: "prod_team", prices: [first.prices.teamMonthly, first.prices.teamAnnual] }, { product: "prod_business" }] });
    expect(f.made).toContain("portal");
    const count = f.made.length;
    const out: string[] = [];
    await stripeSetupMain(["--public-url", "https://app.wizelens.com"], {}, (l) => out.push(l), f.client);
    expect(f.made.length).toBe(count);
    expect(out.join("\n")).toMatch(/nothing new was made[\s\S]*--stripe-prices '\{"teamMonthly"/);
  });

  it("adds a missing tax code and tax behavior, and says when Stripe Tax is not active", async () => {
    const f = setupFake("pending");
    await stripeSetup(f.client);
    for (const p of f.products) p.tax_code = null;
    for (const p of f.prices) p.tax_behavior = "unspecified";
    const out: string[] = [];
    await stripeSetupMain([], {}, (l) => out.push(l), f.client);
    expect(f.products.every((p) => p.tax_code === TAX_CODE) && f.prices.every((p) => p.tax_behavior === "exclusive")).toBe(true);
    expect(out.join("\n")).toMatch(/Made: tax code on WizeLens Team[\s\S]*tax behavior on wizelens_gb_overage[\s\S]*Stripe Tax is not active/);
  });
});

describe("plan set", () => {
  it("sets an Enterprise plan with its own limits, by slug", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wl-plan-"));
    let url: string;
    ({ cloud, url } = await startCloud({ database: `pglite:${dir}` }));
    const { orgId } = await setupOwner(cloud, url);
    const [{ slug }] = (await cloud.app.db.query<{ slug: string }>("SELECT slug FROM orgs WHERE id = $1", [orgId])) as [{ slug: string }];
    await cloud.close();
    cloud = undefined!;
    const out: string[] = [];
    await expect(planMain(["set", slug, "team", "--gb", "5", "--database", `pglite:${dir}`], {}, (l) => out.push(l))).rejects.toThrow(/enterprise/);
    await planMain(["set", slug, "enterprise", "--gb", "5000", "--retention-days", "180", "--database", `pglite:${dir}`], {}, (l) => out.push(l));
    expect(out).toEqual([expect.stringMatching(/is on Enterprise now/)]);
  });
});
