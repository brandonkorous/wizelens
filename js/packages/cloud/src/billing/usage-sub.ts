import type { Queryable } from "../db/db.js";
import type { StripeClient, StripePrices } from "./options.js";

// Extra GB bill on a separate monthly subscription with only the metered price, from the 1st (UTC): tiers count calendar months.

/** Marks the usage subscription in Stripe, so the webhook keeps it away from the plan sync (billing/webhook.ts). */
export const USAGE_ROLE = "usage";
const LIVE = new Set(["active", "trialing", "past_due"]);

/** The next 1st of a month, 00:00 UTC, in seconds. */
export function nextMonthStartS(nowMs: number): number {
  const d = new Date(nowMs);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000);
}

export interface UsageSubDeps {
  db: Queryable;
  client: StripeClient;
  prices: StripePrices;
  now: () => number;
}

async function current(d: UsageSubDeps, orgId: string): Promise<string | null> {
  const [row] = await d.db.query<{ id: string | null }>("SELECT overage_subscription_id AS id FROM orgs WHERE id = $1", [orgId]);
  return row?.id ?? null;
}

/** Make sure a paid organization has its usage subscription. `planSubId` makes the create idempotent. */
export async function ensureUsageSub(d: UsageSubDeps, orgId: string, customerId: string, planSubId: string): Promise<void> {
  const id = await current(d, orgId);
  if (id) {
    const sub = await d.client.subscriptions.retrieve(id).catch(() => null);
    if (sub && LIVE.has(sub.status)) return;
  }
  // Checkout saves the card on the plan subscription, not the customer, so the usage subscription takes the same one.
  const plan = await d.client.subscriptions.retrieve(planSubId);
  const pm = typeof plan.default_payment_method === "string" ? plan.default_payment_method : plan.default_payment_method?.id;
  const sub = await d.client.subscriptions.create(
    {
      customer: customerId,
      ...(pm ? { default_payment_method: pm } : {}),
      items: [{ price: d.prices.overage }],
      billing_cycle_anchor: nextMonthStartS(d.now()),
      proration_behavior: "none",
      // Tax like the plan: Stripe Tax from the address and tax ID that Checkout saved on the customer.
      automatic_tax: { enabled: true },
      billing_mode: { type: "flexible" },
      description: "WizeLens extra data (GB above the plan's included GB)",
      metadata: { wizelensOrgId: orgId, wizelensRole: USAGE_ROLE },
    },
    { idempotencyKey: `wl-usage-${orgId}-${planSubId}${id ? `-${id}` : ""}` },
  );
  await d.db.query("UPDATE orgs SET overage_subscription_id = $1 WHERE id = $2", [sub.id, orgId]);
}

/** End the usage subscription when the plan ends. Stripe sends the last usage invoice at once. */
export async function endUsageSub(d: UsageSubDeps, orgId: string): Promise<void> {
  const id = await current(d, orgId);
  if (!id) return;
  await d.client.subscriptions.cancel(id, { invoice_now: true, prorate: false }).catch((err: unknown) => {
    if ((err as { code?: string }).code !== "resource_missing") throw err;
  });
  await d.db.query("UPDATE orgs SET overage_subscription_id = NULL WHERE id = $1", [orgId]);
}
