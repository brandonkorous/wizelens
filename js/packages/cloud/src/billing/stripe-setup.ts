import type { Stripe } from "stripe";
import type { StripeClient, StripePrices } from "./options.js";
import { OVERAGE_TIERS, PLANS } from "./plans.js";

// `wizelens-cloud stripe-setup`: products, prices, meter, and webhook, made once; reruns reuse them (lookup key, event name, URL) and add a missing tax code or tax behavior.

export const METER_EVENT = "wizelens_gb";
export const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];
const LOOKUP: Record<Exclude<keyof StripePrices, "meter">, string> = {
  teamMonthly: "wizelens_team_monthly",
  teamAnnual: "wizelens_team_annual",
  businessMonthly: "wizelens_business_monthly",
  businessAnnual: "wizelens_business_annual",
  overage: "wizelens_gb_overage",
};
/** Software as a service for business use, so Stripe Tax picks the right rate in each place. */
export const TAX_CODE = "txcd_10103001";

export interface SetupResult {
  prices: StripePrices;
  /** Made by this run: products, prices, the meter, the webhook. */
  made: string[];
  webhookUrl?: string;
  /** Only when this run made the webhook: Stripe shows the secret once. */
  webhookSecret?: string;
  /** Stripe Tax is active (it needs the head office address); Checkout fails until it is. */
  taxReady: boolean;
}

async function meterOf(client: StripeClient, made: string[]): Promise<Stripe.Billing.Meter> {
  for await (const m of client.billing.meters.list({ status: "active", limit: 100 })) if (m.event_name === METER_EVENT) return m;
  made.push(`meter ${METER_EVENT}`);
  return client.billing.meters.create({
    display_name: "WizeLens extra data (GB)",
    event_name: METER_EVENT,
    default_aggregation: { formula: "sum" },
    customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
    value_settings: { event_payload_key: "value" },
  });
}

async function productOf(client: StripeClient, key: string, name: string, made: string[]): Promise<string> {
  const [found] = (await client.products.search({ query: `metadata['wizelens']:'${key}' AND active:'true'` })).data;
  if (found?.tax_code) return found.id;
  if (found) {
    made.push(`tax code on ${name}`);
    return (await client.products.update(found.id, { tax_code: TAX_CODE })).id;
  }
  made.push(`product ${name}`);
  return (await client.products.create({ name, tax_code: TAX_CODE, metadata: { wizelens: key } })).id;
}

/** The price for each lookup key: the one that exists, or a new one. */
function priceParams(meterId: string, products: Record<"team" | "business" | "data", string>): Record<keyof typeof LOOKUP, Stripe.PriceCreateParams> {
  const flat = (product: string, usd: number, interval: "month" | "year") => ({ product, currency: "usd", tax_behavior: "exclusive" as const, unit_amount: Math.round(usd * 100), recurring: { interval } });
  const tiers = OVERAGE_TIERS.map((t) => ({ up_to: t.upToGb ?? ("inf" as const), unit_amount: t.centsPerGb }));
  return {
    teamMonthly: flat(products.team, PLANS.team.monthlyUsd!, "month"),
    teamAnnual: flat(products.team, PLANS.team.annualUsd!, "year"),
    businessMonthly: flat(products.business, PLANS.business.monthlyUsd!, "month"),
    businessAnnual: flat(products.business, PLANS.business.annualUsd!, "year"),
    overage: { product: products.data, currency: "usd", tax_behavior: "exclusive", billing_scheme: "tiered", tiers_mode: "graduated", tiers, recurring: { interval: "month", usage_type: "metered", meter: meterId } },
  };
}

async function webhookOf(client: StripeClient, url: string, made: string[]): Promise<string | undefined> {
  for await (const w of client.webhookEndpoints.list({ limit: 100 })) if (w.url === url) return undefined;
  made.push(`webhook ${url}`);
  return (await client.webhookEndpoints.create({ url, enabled_events: WEBHOOK_EVENTS, description: "WizeLens Cloud billing" })).secret;
}

/** Make (or find) everything, and return the ids to deploy with. `publicUrl` also makes the webhook. */
export async function stripeSetup(client: StripeClient, publicUrl?: string): Promise<SetupResult> {
  const made: string[] = [];
  const meter = await meterOf(client, made);
  const products = {
    team: await productOf(client, "team", "WizeLens Team", made),
    business: await productOf(client, "business", "WizeLens Business", made),
    data: await productOf(client, "data", "WizeLens extra data", made),
  };
  const existing = await client.prices.list({ lookup_keys: Object.values(LOOKUP), active: true, limit: 100 });
  const params = priceParams(meter.id, products);
  const ids = {} as Record<keyof typeof LOOKUP, string>;
  for (const [k, lookup] of Object.entries(LOOKUP) as [keyof typeof LOOKUP, string][]) {
    const hit = existing.data.find((p) => p.lookup_key === lookup);
    if (!hit) made.push(`price ${lookup}`);
    else if (hit.tax_behavior === "unspecified") {
      made.push(`tax behavior on ${lookup}`);
      await client.prices.update(hit.id, { tax_behavior: "exclusive" });
    }
    ids[k] = hit?.id ?? (await client.prices.create({ ...params[k], lookup_key: lookup })).id;
  }
  const webhookUrl = publicUrl ? `${publicUrl.replace(/\/+$/, "")}/_wizelens/api/auth/stripe/webhook` : undefined;
  const webhookSecret = webhookUrl ? await webhookOf(client, webhookUrl, made) : undefined;
  const taxReady = (await client.tax.settings.retrieve()).status === "active";
  return { prices: { ...ids, meter: METER_EVENT }, made, webhookUrl, webhookSecret, taxReady };
}
