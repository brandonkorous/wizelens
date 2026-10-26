import { parseArgs } from "node:util";
import { openDb } from "../db/db.js";
import { migrate } from "../db/migrate.js";
import { findOrg, setPlan } from "../repo/billing.js";
import type { StripeClient } from "./options.js";
import { isPlanId, PLAN_IDS, PLANS } from "./plans.js";
import { stripeSetup, WEBHOOK_EVENTS } from "./stripe-setup.js";

const positiveInt = (v: string | undefined, name: string, max: number): number | undefined => {
  if (v === undefined) return undefined;
  if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > max) throw new Error(`${name} must be a whole number from 1 to ${max}.`);
  return Number(v);
};

/** `wizelens-cloud plan set <org> <plan> [--gb N] [--retention-days N]`: for Enterprise deals and support. */
export async function planMain(argv: string[], env: NodeJS.ProcessEnv, log = console.info): Promise<void> {
  const { values: a, positionals: p } = parseArgs({ args: argv, allowPositionals: true, options: { database: { type: "string" }, gb: { type: "string" }, "retention-days": { type: "string" } } });
  const [verb, orgRef, plan] = p;
  if (verb !== "set" || !orgRef || !isPlanId(plan)) throw new Error(`Usage: wizelens-cloud plan set <org id or slug> <${PLAN_IDS.join("|")}> [--gb N] [--retention-days N]`);
  const gb = positiveInt(a.gb, "--gb", 1_000_000);
  const days = positiveInt(a["retention-days"], "--retention-days", 400);
  if ((gb || days) && plan !== "enterprise") throw new Error("--gb and --retention-days are for the enterprise plan; other plans use their own limits.");
  const db = await openDb(a.database ?? env.DATABASE_URL ?? "pglite:./.wizelens-cloud");
  try {
    await migrate(db);
    const org = await findOrg(db, orgRef);
    if (!org) throw new Error(`No organization "${orgRef}".`);
    const changed = await db.tx((q) => setPlan(q, org.id, { plan, gb, retentionDays: days }, "cli", Date.now()));
    log(changed ? `${org.name} is on ${PLANS[plan].name} now.` : `${org.name} was on ${PLANS[plan].name} already.`);
  } finally {
    await db.close();
  }
}

/** `wizelens-cloud stripe-setup --stripe-secret-key sk_... [--public-url https://...]`: prints the options to deploy with. */
export async function stripeSetupMain(argv: string[], env: NodeJS.ProcessEnv, log = console.info, client?: StripeClient): Promise<void> {
  const { values: a } = parseArgs({ args: argv, options: { "stripe-secret-key": { type: "string" }, "public-url": { type: "string" } } });
  const key = a["stripe-secret-key"] ?? env.WIZELENS_CLOUD_STRIPE_SECRET_KEY;
  if (!key && !client) throw new Error("Usage: wizelens-cloud stripe-setup --stripe-secret-key sk_... [--public-url https://app.example.com]");
  const { default: Stripe } = await import("stripe");
  const r = await stripeSetup(client ?? new Stripe(key!), a["public-url"] ?? env.WIZELENS_CLOUD_PUBLIC_URL);
  log(r.made.length ? `Made: ${r.made.join(", ")}.` : "Everything existed already; nothing new was made.");
  if (!r.taxReady) log("\nStripe Tax is not active: add the head office address in the Stripe Dashboard (Tax > Settings). Checkout fails until it is.");
  log(`\nDeploy the cloud with:\n  --stripe-secret-key <the key>\n  --stripe-prices '${JSON.stringify(r.prices)}'`);
  if (r.webhookSecret) log(`  --stripe-webhook-secret ${r.webhookSecret}   (Stripe shows it only now)`);
  else if (r.webhookUrl) log(`  --stripe-webhook-secret <the signing secret of the webhook at ${r.webhookUrl}>`);
  else log(`\nThen add a Stripe webhook to <public-url>/_wizelens/api/auth/stripe/webhook with: ${WEBHOOK_EVENTS.join(", ")}.`);
}
