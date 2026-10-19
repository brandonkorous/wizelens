import type { StripeDeps } from "./stripe-plugin.js";
import type { CloudConfig } from "../config.js";
import type { Db } from "../db/db.js";
import { Limiter } from "./limits.js";
import type { StripeClient } from "./options.js";
import { reportUsage } from "./report.js";
import { syncOrgPlan } from "./sync.js";
import { UsageMeter } from "./usage.js";

/** Plans, usage, limits, and (with billing on) Stripe, for routes and jobs. */
export interface Billing {
  /** False without a Stripe key: every organization is unlimited and no plan shows anywhere. */
  readonly on: boolean;
  readonly usage: UsageMeter;
  readonly limits: Limiter;
  /** The Stripe plugin's needs, with billing on. */
  readonly stripe?: StripeDeps;
  /** Forget a cached plan after a change, so limits apply at once on this instance. */
  forget(orgId: string): void;
  /** With billing on: mend missing usage subscriptions, then send unreported days to the Stripe meter (billing/report.ts). */
  report?: () => Promise<number>;
}

/** Paid organizations without a usage subscription (it failed to start, or someone canceled it in the portal) get it again. */
async function mend(db: Db, sync: (orgId: string) => Promise<void>): Promise<void> {
  const rows = await db.query<{ id: string }>("SELECT id FROM orgs WHERE plan IN ('team', 'business') AND stripe_customer_id IS NOT NULL AND overage_subscription_id IS NULL");
  for (const r of rows) await sync(r.id).catch((err: unknown) => console.error(`[wizelens-cloud] usage subscription for ${r.id} failed:`, err));
}

async function stripeClientOf(config: CloudConfig): Promise<StripeClient> {
  if (config.billing.stripeClient) return config.billing.stripeClient;
  const { default: Stripe } = await import("stripe");
  return new Stripe(config.billing.stripeSecretKey!, { appInfo: { name: "WizeLens Cloud", url: "https://wizelens.com" }, maxNetworkRetries: 2 });
}

export async function createBilling(config: CloudConfig, db: Db): Promise<Billing> {
  const usage = new UsageMeter(db, config.now);
  const limits = new Limiter(db, usage, config.billing.on, config.now);
  const forget = (orgId: string) => limits.forget(orgId);
  if (!config.billing.on) return { on: false, usage, limits, forget };
  const client = await stripeClientOf(config);
  const d = { db, client, prices: config.billing.prices!, now: config.now };
  const stripe: StripeDeps = { client, webhookSecret: config.billing.stripeWebhookSecret!, prices: d.prices, sync: async (orgId) => void (await syncOrgPlan(d, orgId, forget)) };
  const report = async () => (await mend(db, stripe.sync), reportUsage(d));
  return { on: true, usage, limits, stripe, forget, report };
}
