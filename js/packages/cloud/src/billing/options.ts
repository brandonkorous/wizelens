import type { Stripe } from "stripe";

/** The Stripe ids `wizelens-cloud stripe-setup` prints, passed back as `--stripe-prices` JSON. */
export interface StripePrices {
  teamMonthly: string;
  teamAnnual: string;
  businessMonthly: string;
  businessAnnual: string;
  /** The graduated metered price on the GB meter, billed monthly. */
  overage: string;
  /** The meter's event name, `wizelens_gb`. */
  meter: string;
}

export const PRICE_KEYS: readonly (keyof StripePrices)[] = ["teamMonthly", "teamAnnual", "businessMonthly", "businessAnnual", "overage", "meter"];

/** The Stripe calls the cloud makes. Tests pass a fake with the same shape. */
export type StripeClient = Stripe;

export interface BillingOptions {
  /** Stripe's secret key (sk_ or rk_). Without it billing is off: every organization is unlimited. */
  stripeSecretKey?: string;
  /** The Stripe webhook's whsec_ signing secret. */
  stripeWebhookSecret?: string;
  /** Price and meter ids, as JSON text or an object. */
  stripePrices?: string | StripePrices;
  /** For tests: a Stripe client in place of the real one. */
  stripeClient?: StripeClient;
}

export interface BillingConfig {
  on: boolean;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  prices?: StripePrices;
  stripeClient?: StripeClient;
}

function pricesOf(raw: string | StripePrices | undefined): StripePrices {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      throw new Error("--stripe-prices must be JSON, as `wizelens-cloud stripe-setup` prints it.");
    }
  }
  const o = (v ?? {}) as Record<string, unknown>;
  const missing = PRICE_KEYS.filter((k) => typeof o[k] !== "string" || !o[k]);
  if (missing.length) throw new Error(`--stripe-prices is missing ${missing.join(", ")}. Run wizelens-cloud stripe-setup to make them.`);
  return Object.fromEntries(PRICE_KEYS.map((k) => [k, o[k]])) as unknown as StripePrices;
}

/** Billing is on only with a Stripe key; then the webhook secret, the prices, and a public URL must come too. */
export function resolveBilling(o: BillingOptions & { publicUrl?: string }): BillingConfig {
  if (!o.stripeSecretKey) {
    if (o.stripeWebhookSecret || o.stripePrices) throw new Error("--stripe-webhook-secret and --stripe-prices need --stripe-secret-key.");
    return { on: false };
  }
  if (!/^(sk|rk)_/.test(o.stripeSecretKey)) throw new Error("--stripe-secret-key must be a Stripe secret key (it starts with sk_ or rk_).");
  if (!o.stripeWebhookSecret?.startsWith("whsec_")) throw new Error("Billing needs --stripe-webhook-secret (it starts with whsec_).");
  if (!o.publicUrl) throw new Error("Billing needs --public-url, so Stripe sends people back to this cloud.");
  return { on: true, stripeSecretKey: o.stripeSecretKey, stripeWebhookSecret: o.stripeWebhookSecret, prices: pricesOf(o.stripePrices), stripeClient: o.stripeClient };
}
