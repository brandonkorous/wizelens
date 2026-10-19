import { orgBilling, setPlan } from "../repo/billing.js";
import { isPaidPlan, type PaidPlanId, type PlanId } from "./plans.js";
import { reportBeforeEnd } from "./report.js";
import { endUsageSub, ensureUsageSub, type UsageSubDeps } from "./usage-sub.js";

// orgs.plan follows the organization's Stripe subscription (Better Auth's `subscriptions` rows, written by its webhook).

/** A failed payment keeps the plan while Stripe retries (past_due); after the last retry Stripe cancels or marks it unpaid. */
const KEEPS_PLAN = new Set(["active", "trialing", "past_due"]);
const RANK: Record<PaidPlanId, number> = { team: 1, business: 2 };

interface SubRow {
  plan: string;
  status: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
}

/** The best live paid subscription of an organization, if any. */
async function liveSub(d: UsageSubDeps, orgId: string): Promise<(SubRow & { plan: PaidPlanId }) | undefined> {
  const rows = await d.db.query<SubRow>("SELECT plan, status, stripe_subscription_id, stripe_customer_id FROM subscriptions WHERE reference_id = $1", [orgId]);
  const live = rows.filter((r): r is SubRow & { plan: PaidPlanId } => isPaidPlan(r.plan) && KEEPS_PLAN.has(r.status) && !!r.stripe_subscription_id);
  return live.sort((a, b) => RANK[b.plan] - RANK[a.plan])[0];
}

/** Set the plan from Stripe: a live subscription's plan, else Free. Plans set by hand (Enterprise, Unlimited) stay without one. */
export async function syncOrgPlan(d: UsageSubDeps, orgId: string, forget: (orgId: string) => void): Promise<PlanId | undefined> {
  const before = await orgBilling(d.db, orgId);
  if (!before) return undefined;
  const live = await liveSub(d, orgId);
  const manual = before.plan === "enterprise" || before.plan === "unlimited";
  const next: PlanId = live ? live.plan : manual ? before.plan : "free";
  await setPlan(d.db, orgId, { plan: next }, "stripe", d.now());
  forget(orgId);
  const customer = live?.stripe_customer_id ?? before.stripeCustomerId;
  if (live && customer) await ensureUsageSub(d, orgId, customer, live.stripe_subscription_id!);
  else if (!live && before.overageSubscriptionId) {
    // Bill the finished days at the old plan's included GB before the usage subscription ends.
    await reportBeforeEnd(d, orgId, before.plan);
    await endUsageSub(d, orgId);
  }
  return next;
}
