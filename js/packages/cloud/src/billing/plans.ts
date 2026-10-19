// Cloud plans, prices, and limits in one place (docs/BILLING-PLAN.md). A first version: change them here only.

export type PlanId = "unlimited" | "free" | "team" | "business" | "enterprise";
export type Feature = "sso" | "scim" | "auditExport";
/** The plans people buy through Stripe. */
export type PaidPlanId = "team" | "business";

export interface Plan {
  id: PlanId;
  name: string;
  /** Dollars per month; null when the price is set by hand (Enterprise) or there is none. */
  monthlyUsd: number | null;
  /** Dollars per year: 10 months' price for 12. */
  annualUsd: number | null;
  /** GB a month included; null means no limit. */
  includedGb: number | null;
  /** The longest retention the plan allows, in days. */
  maxRetentionDays: number;
  /** Past the included GB, data keeps coming and costs extra (Team and Business). False: ingest stops at the cap. */
  overage: boolean;
  features: Record<Feature, boolean>;
}

const none: Record<Feature, boolean> = { sso: false, scim: false, auditExport: false };
const all: Record<Feature, boolean> = { sso: true, scim: true, auditExport: true };

export const PLANS: Record<PlanId, Plan> = {
  unlimited: { id: "unlimited", name: "Unlimited", monthlyUsd: null, annualUsd: null, includedGb: null, maxRetentionDays: 400, overage: false, features: all },
  free: { id: "free", name: "Free", monthlyUsd: 0, annualUsd: 0, includedGb: 10, maxRetentionDays: 14, overage: false, features: none },
  team: { id: "team", name: "Team", monthlyUsd: 29, annualUsd: 290, includedGb: 50, maxRetentionDays: 30, overage: true, features: none },
  business: { id: "business", name: "Business", monthlyUsd: 99, annualUsd: 990, includedGb: 150, maxRetentionDays: 90, overage: true, features: all },
  enterprise: { id: "enterprise", name: "Enterprise", monthlyUsd: null, annualUsd: null, includedGb: null, maxRetentionDays: 400, overage: false, features: all },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];
export const PAID_PLANS: readonly PaidPlanId[] = ["team", "business"];
export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && v in PLANS;
export const isPaidPlan = (v: unknown): v is PaidPlanId => v === "team" || v === "business";

/** Extra data, graduated, counted on the GB above the plan's included GB each month: first 500 at $0.30, next 1,500 at $0.20, then $0.10. */
export const OVERAGE_TIERS: readonly { upToGb: number | null; centsPerGb: number }[] = [
  { upToGb: 500, centsPerGb: 30 },
  { upToGb: 2000, centsPerGb: 20 },
  { upToGb: null, centsPerGb: 10 },
];

/** A GB is 10^9 bytes of request body as sent, before compression is undone. */
export const BYTES_PER_GB = 1e9;

/** What `extraGb` above the included GB costs, in cents, with the graduated tiers. */
export function overageCents(extraGb: number): number {
  let left = Math.max(0, extraGb);
  let from = 0;
  let cents = 0;
  for (const t of OVERAGE_TIERS) {
    const size = t.upToGb === null ? left : Math.min(left, t.upToGb - from);
    cents += size * t.centsPerGb;
    left -= size;
    if (t.upToGb !== null) from = t.upToGb;
    if (left <= 0) break;
  }
  return Math.round(cents * 100) / 100;
}

/** One organization's billing columns. */
export interface OrgPlanRow {
  plan: PlanId;
  /** Enterprise only: the GB a month and the retention set by hand. */
  planGb: number | null;
  planRetentionDays: number | null;
}

/** The limits that apply now: everything is unlimited while billing is off. */
export interface Limits {
  plan: Plan;
  includedGb: number | null;
  maxRetentionDays: number;
}

export function limitsOf(row: OrgPlanRow, billingOn: boolean): Limits {
  const plan = PLANS[billingOn ? row.plan : "unlimited"] ?? PLANS.free;
  if (plan.id !== "enterprise") return { plan, includedGb: plan.includedGb, maxRetentionDays: plan.maxRetentionDays };
  return { plan, includedGb: row.planGb, maxRetentionDays: Math.min(400, row.planRetentionDays ?? 400) };
}

/** The cheapest plan with a feature, for a 402 answer and the upgrade prompt. */
export const planFor = (feature: Feature): PaidPlanId | "enterprise" => (PLANS.team.features[feature] ? "team" : PLANS.business.features[feature] ? "business" : "enterprise");
