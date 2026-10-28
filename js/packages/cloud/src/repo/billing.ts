import { type Feature, isPlanId, type Limits, limitsOf, type OrgPlanRow, type PlanId } from "../billing/plans.js";
import type { Queryable } from "../db/db.js";
import { audit } from "./audit.js";

// An organization's plan columns (orgs.plan, plan_gb, plan_retention_days, spend_cap_cents) and the changes to them.

export interface OrgBilling extends OrgPlanRow {
  /** The monthly overage limit in cents (Team and Business), or null for none. */
  spendCapCents: number | null;
  stripeCustomerId: string | null;
  /** The separate monthly subscription that bills extra GB (billing/overage-sub.ts). */
  overageSubscriptionId: string | null;
}

const COLUMNS = `plan, plan_gb AS "planGb", plan_retention_days AS "planRetentionDays", spend_cap_cents AS "spendCapCents",
  stripe_customer_id AS "stripeCustomerId", overage_subscription_id AS "overageSubscriptionId"`;

export async function orgBilling(q: Queryable, orgId: string): Promise<OrgBilling | undefined> {
  const [row] = await q.query<OrgBilling>(`SELECT ${COLUMNS} FROM orgs WHERE id = $1`, [orgId]);
  return row ? { ...row, plan: isPlanId(row.plan) ? row.plan : "free" } : undefined;
}

/** The limits that apply to an organization now; unlimited while billing is off. */
export async function orgLimits(q: Queryable, orgId: string, billingOn: boolean): Promise<Limits> {
  return limitsOf((await orgBilling(q, orgId)) ?? { plan: "free", planGb: null, planRetentionDays: null }, billingOn);
}

export async function orgHas(q: Queryable, orgId: string, billingOn: boolean, feature: Feature): Promise<boolean> {
  return !billingOn || (await orgLimits(q, orgId, billingOn)).plan.features[feature];
}

export interface PlanChange {
  plan: PlanId;
  /** Enterprise only. */
  gb?: number | null;
  retentionDays?: number | null;
}

/** Set the plan, lower retention (and each project's log days) to the plan's maximum, and write an audit line. Returns false when nothing changed. */
export async function setPlan(q: Queryable, orgId: string, change: PlanChange, actor: string, now: number): Promise<boolean> {
  const before = await orgBilling(q, orgId);
  if (!before) throw new Error(`No organization ${orgId}.`);
  const custom = change.plan === "enterprise";
  const gb = custom ? (change.gb ?? before.planGb) : null;
  const days = custom ? (change.retentionDays ?? before.planRetentionDays) : null;
  if (before.plan === change.plan && before.planGb === gb && before.planRetentionDays === days) return false;
  const max = limitsOf({ plan: change.plan, planGb: gb, planRetentionDays: days }, true).maxRetentionDays;
  const oldMax = limitsOf(before, true).maxRetentionDays;
  // At the old plan's longest, the organization gets the new plan's longest (Business promises 90 days); a shorter choice stays.
  await q.query(
    "UPDATE orgs SET plan = $1, plan_gb = $2, plan_retention_days = $3, retention_days = CASE WHEN retention_days >= $6 THEN $4 ELSE LEAST(retention_days, $4) END WHERE id = $5",
    [change.plan, gb, days, max, orgId, oldMax],
  );
  await q.query("UPDATE projects SET log_retention_days = LEAST(log_retention_days, $1) WHERE org_id = $2 AND log_retention_days IS NOT NULL", [max, orgId]);
  if (change.plan !== "team" && change.plan !== "business") await q.query("UPDATE orgs SET spend_cap_cents = NULL WHERE id = $1", [orgId]);
  await audit(q, orgId, actor, "plan.change", { from: before.plan, plan: change.plan, ...(custom ? { gb, retentionDays: days } : {}) }, now);
  return true;
}

export async function setSpendCap(q: Queryable, orgId: string, cents: number | null, actor: string, now: number): Promise<void> {
  await q.query("UPDATE orgs SET spend_cap_cents = $1 WHERE id = $2", [cents, orgId]);
  await audit(q, orgId, actor, "billing.cap", { capUsd: cents === null ? null : cents / 100 }, now);
}

/** Organizations by id or slug, for the `plan set` command. */
export async function findOrg(q: Queryable, idOrSlug: string): Promise<{ id: string; name: string } | undefined> {
  const [row] = await q.query<{ id: string; name: string }>("SELECT id, name FROM orgs WHERE id = $1 OR slug = $1", [idOrSlug]);
  return row;
}

/** True while a Stripe subscription still runs (or retries a payment) for the organization. */
export async function hasLivePlan(q: Queryable, orgId: string): Promise<boolean> {
  const [row] = await q.query<{ live: boolean }>("SELECT EXISTS (SELECT 1 FROM subscriptions WHERE reference_id = $1 AND status IN ('active', 'trialing', 'past_due')) AS live", [orgId]);
  return row?.live === true;
}
