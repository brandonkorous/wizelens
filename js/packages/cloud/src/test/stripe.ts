import Stripe from "stripe";
import type { StripeClient, StripePrices } from "../billing/options.js";

// A fake Stripe for tests: it keeps customers and subscriptions in memory, and signs webhook events like Stripe does.

export const PRICES: StripePrices = { teamMonthly: "price_team_m", teamAnnual: "price_team_y", businessMonthly: "price_biz_m", businessAnnual: "price_biz_y", overage: "price_gb", meter: "wizelens_gb" };
export const WEBHOOK_SECRET = "whsec_test_secret";
const real = new Stripe("sk_test_fake");

type Sub = { id: string; customer: string; status: string; metadata: Record<string, string>; items: { data: unknown[] }; default_payment_method: string | null; [k: string]: unknown };

const item = (price: string, interval = "month") => ({ id: `si_${price}`, quantity: 1, price: { id: price, recurring: { interval, usage_type: price === PRICES.overage ? "metered" : "licensed" } }, current_period_start: 1_760_000_000, current_period_end: 1_762_600_000 });

export function fakeStripe() {
  const calls: { method: string; args: unknown[] }[] = [];
  const subs = new Map<string, Sub>();
  const meterEvents: Record<string, unknown>[] = [];
  let n = 0;
  const log = (method: string, ...args: unknown[]) => calls.push({ method, args });
  const newSub = (customer: string, price: string, metadata: Record<string, string> = {}, interval = "month"): Sub => {
    const s: Sub = { id: `sub_${++n}`, object: "subscription", customer, status: "active", metadata, items: { data: [item(price, interval)] }, default_payment_method: "pm_card", cancel_at_period_end: false, cancel_at: null, canceled_at: null, ended_at: null, trial_start: null, trial_end: null, schedule: null };
    subs.set(s.id, s);
    return s;
  };
  const client = {
    webhooks: real.webhooks,
    customers: {
      create: async (p: { metadata?: Record<string, string> }) => (log("customers.create", p), { id: `cus_${++n}`, metadata: p.metadata ?? {} }),
      search: async () => ({ data: [] }),
      list: async function* () {},
      retrieve: async (id: string) => ({ id, name: "", email: "" }),
      update: async (id: string) => ({ id }),
    },
    subscriptions: {
      retrieve: async (id: string) => subs.get(id) ?? Promise.reject(Object.assign(new Error("missing"), { code: "resource_missing" })),
      list: async () => ({ data: [...subs.values()] }),
      create: async (p: { customer: string; items: { price: string }[]; metadata?: Record<string, string> }, o?: unknown) => (log("subscriptions.create", p, o), newSub(p.customer, p.items[0]!.price, p.metadata)),
      cancel: async (id: string, p?: unknown) => (log("subscriptions.cancel", id, p), Object.assign(subs.get(id) ?? {}, { status: "canceled" })),
      update: async (id: string, p: unknown) => (log("subscriptions.update", id, p), subs.get(id)),
    },
    checkout: { sessions: { create: async (p: unknown) => (log("checkout.sessions.create", p), { id: "cs_1", url: "https://checkout.stripe.test/cs_1" }) } },
    billingPortal: { sessions: { create: async (p: unknown) => (log("billingPortal.sessions.create", p), { url: "https://billing.stripe.test/p_1" }) } },
    prices: { retrieve: async (id: string) => ({ id, recurring: { usage_type: "licensed" } }), list: async () => ({ data: [] }) },
    subscriptionSchedules: { list: async () => ({ data: [] }) },
    billing: { meterEvents: { create: async (p: Record<string, unknown>) => (meterEvents.push(p), log("meterEvents.create", p), { identifier: p.identifier }) } },
  };
  /** A signed webhook request body and header, as Stripe would send. */
  const sign = (type: string, object: unknown) => {
    const payload = JSON.stringify({ id: `evt_${++n}`, object: "event", type, data: { object } });
    return { payload, header: real.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }) };
  };
  return { client: client as unknown as StripeClient, calls, subs, meterEvents, newSub, sign, called: (m: string) => calls.filter((c) => c.method === m) };
}

export type FakeStripe = ReturnType<typeof fakeStripe>;

export const billingOptions = (fake: FakeStripe) => ({ stripeSecretKey: "sk_test_fake", stripeWebhookSecret: WEBHOOK_SECRET, stripePrices: PRICES, stripeClient: fake.client });

/** A port nobody listens on now, for a cloud that needs its public URL before it starts. */
export async function freePort(): Promise<number> {
  const { createServer } = await import("node:net");
  return new Promise((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

/** A cloud with billing on, its public URL on a free local port. */
export async function billedOptions(fake: FakeStripe, extra: Record<string, unknown> = {}) {
  const port = await freePort();
  return { port, publicUrl: `http://127.0.0.1:${port}`, ...billingOptions(fake), ...extra };
}
