// The Stripe customer portal: cards, invoices, address, canceling at the period end, and switching between Team and Business.
import type { Stripe } from "stripe";
import type { StripeClient } from "./options.js";

type Features = Stripe.BillingPortal.ConfigurationCreateParams.Features;
export type PortalPlans = { product: string; prices: string[] }[];

/** What the portal lets a customer do. Plan switches go only between our plans' prices, so extra data stays as it is. */
export function portalFeatures(plans: PortalPlans): Features {
  return {
    customer_update: { enabled: true, allowed_updates: ["email", "address", "name", "tax_id"] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
    subscription_update: { enabled: true, default_allowed_updates: ["price"], proration_behavior: "create_prorations", products: plans },
  };
}

/** True when the portal already switches plans between exactly these prices. */
function switchesPlans(c: Stripe.BillingPortal.Configuration, plans: PortalPlans): boolean {
  const u = c.features.subscription_update;
  const has = (u.products ?? []).map((p) => `${p.product}:${[...p.prices].sort().join(",")}`).sort();
  const want = plans.map((p) => `${p.product}:${[...p.prices].sort().join(",")}`).sort();
  return u.enabled && c.features.subscription_cancel.enabled && JSON.stringify(has) === JSON.stringify(want);
}

/** Set the default portal configuration: Better Auth opens portal sessions without naming one. */
export async function portalOf(client: StripeClient, plans: PortalPlans, made: string[]): Promise<void> {
  const [current] = (await client.billingPortal.configurations.list({ is_default: true, limit: 1 })).data;
  if (current && switchesPlans(current, plans)) return;
  made.push("billing portal settings");
  const features = portalFeatures(plans);
  if (current) await client.billingPortal.configurations.update(current.id, { features });
  else await client.billingPortal.configurations.create({ features });
}
