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
  /** The first day with data this month ("2026-10-28"): the projection runs from there at that rate. */
  projectedFrom: string | null;
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

/** GB as billed (1,000,000,000 bytes); under 1 GB in MB, so data that was sent never reads as "0 GB". */
export function fmtGb(gb: number): string {
  if (gb >= 100) return `${Math.round(gb).toLocaleString()} GB`;
  if (gb <= 0 || gb >= 1) return `${(Math.round(gb * 100) / 100).toLocaleString()} GB`;
  const mb = gb * 1000;
  if (mb < 0.1) return "under 0.1 MB";
  return `${(mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb)).toLocaleString()} MB`;
}
export const fmtUsd = (usd: number) => `$${usd.toLocaleString(undefined, { minimumFractionDigits: usd % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
