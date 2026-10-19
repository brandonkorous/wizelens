import type { Queryable } from "../db/db.js";
import { BYTES_PER_GB, limitsOf, type PlanId } from "./plans.js";
import type { StripeClient, StripePrices } from "./options.js";
import { dayOf } from "./usage.js";

// Each finished UTC day, a paid organization's GB above its included GB goes to the Stripe meter once (wl-<org>-<day>, usage_reports).

const DAY_MS = 86_400_000;
/** A day is reported this long after it ends, once every instance flushed it, and well inside the hour Stripe keeps the invoice open. */
const SETTLE_MS = 5 * 60_000;
/** Days a rerun still catches up on (Stripe takes events up to 35 days old). */
const CATCH_UP_DAYS = 7;

export interface ReportDeps {
  db: Queryable;
  client: StripeClient;
  prices: StripePrices;
  now: () => number;
}

interface PaidOrg {
  id: string;
  plan: PlanId;
  plan_gb: number | null;
  plan_retention_days: number | null;
  stripe_customer_id: string;
}

/** Completed days from a week back to yesterday, oldest first. */
export function daysToReport(nowMs: number): string[] {
  const last = Math.floor((nowMs - SETTLE_MS) / DAY_MS) * DAY_MS - DAY_MS;
  return Array.from({ length: CATCH_UP_DAYS }, (_, i) => dayOf(last - (CATCH_UP_DAYS - 1 - i) * DAY_MS));
}

/** Whole GB above the included GB from the 1st through `day`, less what was reported earlier that month. */
async function gbFor(q: Queryable, org: PaidOrg, day: string): Promise<number> {
  const month = `${day.slice(0, 7)}-%`;
  const [used] = await q.query<{ b: number }>("SELECT COALESCE(SUM(bytes), 0)::double precision AS b FROM usage_daily WHERE org_id = $1 AND day LIKE $2 AND day <= $3", [org.id, month, day]);
  const [sent] = await q.query<{ gb: number }>("SELECT COALESCE(SUM(gb), 0)::double precision AS gb FROM usage_reports WHERE org_id = $1 AND day LIKE $2", [org.id, month]);
  const included = limitsOf({ plan: org.plan, planGb: org.plan_gb, planRetentionDays: org.plan_retention_days }, true).includedGb ?? Infinity;
  const extra = Math.floor(Math.max(0, Number(used?.b ?? 0) / BYTES_PER_GB - included));
  return Math.max(0, extra - Number(sent?.gb ?? 0));
}

async function reportDay(d: ReportDeps, org: PaidOrg, day: string): Promise<void> {
  const gb = await gbFor(d.db, org, day);
  if (gb > 0) {
    const timestamp = Math.floor(Date.parse(`${day}T12:00:00Z`) / 1000);
    await d.client.billing.meterEvents.create({ event_name: d.prices.meter, identifier: `wl-${org.id}-${day}`, timestamp, payload: { stripe_customer_id: org.stripe_customer_id, value: String(gb) } });
  }
  await d.db.query("INSERT INTO usage_reports (org_id, day, gb, reported_ms) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [org.id, day, gb, d.now()]);
}

/** Report one organization's unreported days. */
export async function reportOrg(d: ReportDeps, org: PaidOrg): Promise<void> {
  const days = daysToReport(d.now());
  const done = new Set((await d.db.query<{ day: string }>("SELECT day FROM usage_reports WHERE org_id = $1 AND day >= $2", [org.id, days[0]])).map((r) => r.day));
  for (const day of days) if (!done.has(day)) await reportDay(d, org, day);
}

/** Every paid organization with a usage subscription. Returns how many it checked. */
export async function reportUsage(d: ReportDeps): Promise<number> {
  const orgs = await d.db.query<PaidOrg>(
    `SELECT id, plan, plan_gb, plan_retention_days, stripe_customer_id FROM orgs
     WHERE plan IN ('team', 'business') AND stripe_customer_id IS NOT NULL AND overage_subscription_id IS NOT NULL`,
  );
  for (const org of orgs) await reportOrg(d, org);
  return orgs.length;
}

/** One organization by id, when it is paid, for the last report before its usage subscription ends. */
export async function reportBeforeEnd(d: ReportDeps, orgId: string, plan: PlanId): Promise<void> {
  const [row] = await d.db.query<PaidOrg>("SELECT id, plan_gb, plan_retention_days, stripe_customer_id FROM orgs WHERE id = $1 AND stripe_customer_id IS NOT NULL", [orgId]);
  if (row && (plan === "team" || plan === "business")) await reportOrg(d, { ...row, plan });
}
