import { apiSend } from "./api";
import { useApi } from "./useApi";

// Cloud plans and usage (`GET api/orgs/<id>/usage`), and the Stripe steps through Better Auth's Stripe plugin (`api/auth/subscription/*`).

export type Feature = "sso" | "scim" | "auditExport";
export type PlanId = "unlimited" | "free" | "team" | "business" | "enterprise";

export interface PlanView {
  id: PlanId;
  name: string;
  monthlyUsd: number | null;
  annualUsd: number | null;
  includedGb: number | null;
  maxRetentionDays: number;
  overage: boolean;
  features: Record<Feature, boolean>;
}

export interface Usage {
  /** False on a cloud without Stripe: every organization is unlimited and no plan shows. */
  billing: boolean;
  plan: PlanView;
  includedGb: number | null;
  maxRetentionDays: number;
  month: string;
  monthGb: number;
  days: { day: string; gb: number; spans: number; logs: number; points: number }[];
  overageUsd: number;
  projectedGb: number;
  projectedOverageUsd: number;
  spendCapUsd: number | null;
  /** Why ingest is stopped now, or null. */
  blocked: string | null;
  reason: "free" | "cap" | null;
  subscription: { plan: string; status: string; interval: string | null; periodEndMs: number | null; cancelAtPeriodEnd: boolean; cancelAtMs: number | null } | null;
  plans: PlanView[];
}

export const useUsage = (orgId: string | null) => useApi<Usage>(orgId ? `./api/orgs/${orgId}/usage` : null);

/** Where Stripe sends people back: this dashboard's Billing section. */
const back = () => `${window.location.pathname}#/organization/billing`;
const org = (orgId: string) => ({ customerType: "organization", referenceId: orgId });

/** Start or change a paid plan: Stripe Checkout for a new plan, the Stripe portal to confirm a change. Goes to Stripe. */
export async function choosePlan(orgId: string, plan: "team" | "business", annual: boolean): Promise<void> {
  const r = await apiSend<{ url: string }>("POST", "./api/auth/subscription/upgrade", { ...org(orgId), plan, annual, successUrl: back(), cancelUrl: back(), returnUrl: back(), disableRedirect: true });
  window.location.assign(r.url);
}

/** Cards, invoices, and canceling, in the Stripe customer portal. */
export async function openPortal(orgId: string): Promise<void> {
  const r = await apiSend<{ url: string }>("POST", "./api/auth/subscription/billing-portal", { ...org(orgId), returnUrl: back(), disableRedirect: true });
  window.location.assign(r.url);
}

/** Back to Free: cancel at the end of the paid period, confirmed in the Stripe portal. */
export async function cancelPlan(orgId: string): Promise<void> {
  const r = await apiSend<{ url: string }>("POST", "./api/auth/subscription/cancel", { ...org(orgId), returnUrl: back(), disableRedirect: true });
  window.location.assign(r.url);
}

export const setSpendCap = (orgId: string, usd: number | null) => apiSend("PATCH", `./api/orgs/${orgId}/billing`, { spendCapUsd: usd });

export const fmtGb = (gb: number) => (gb >= 100 ? `${Math.round(gb).toLocaleString()} GB` : `${(Math.round(gb * 100) / 100).toLocaleString()} GB`);
export const fmtUsd = (usd: number) => `$${usd.toLocaleString(undefined, { minimumFractionDigits: usd % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
