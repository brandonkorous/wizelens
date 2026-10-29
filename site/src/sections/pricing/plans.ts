// The cloud's plans and prices, as docs/BILLING-PLAN.md sets them. The cloud's own copy is cloud/src/billing/plans.ts.
export const APP_URL = "https://app.wizelens.com";
/** "Start free" opens the cloud on its sign-up form. */
export const START_URL = `${APP_URL}/_wizelens/#/sign-up`;
export const SALES_MAIL = "mailto:hello@wizelens.com?subject=WizeLens%20Enterprise";

export type PlanId = "free" | "team" | "business" | "enterprise";

export type Plan = {
  id: PlanId;
  name: string;
  monthly: number | null;
  gb: number | null;
  days: string;
  note: string;
  features: string[];
};

export const PLANS: Plan[] = [
  { id: "free", name: "Free", monthly: 0, gb: 10, days: "14 days", note: "For one app, or trying it out.", features: ["Unlimited users", "Alerts, share links, and MCP", "Stops at 10 GB until the 1st"] },
  { id: "team", name: "Team", monthly: 29, gb: 50, days: "30 days", note: "For a team with a few services.", features: ["Everything in Free", "Extra data from $0.30 a GB", "An optional monthly spend cap"] },
  { id: "business", name: "Business", monthly: 99, gb: 150, days: "90 days", note: "For a company that signs in with SSO.", features: ["Everything in Team", "SAML and OIDC single sign-on, required if you choose", "SCIM user provisioning", "Audit log export"] },
  { id: "enterprise", name: "Enterprise", monthly: null, gb: null, days: "Up to 400 days", note: "For more data, longer history, or a contract.", features: ["Everything in Business", "Data and history set for you", "An SLA and data residency"] },
];

// Extra data on Team and Business. The steps count the GB above the plan's included GB.
export const TIERS = [
  { size: 500, rate: 0.3, label: "First 500 extra GB" },
  { size: 1500, rate: 0.2, label: "Next 1,500 extra GB" },
  { size: Infinity, rate: 0.1, label: "Above 2,000 extra GB" },
];

export type Split = { included: number; steps: number[] };

// How a month's GB splits into the included part and each price step.
export function split(gb: number, included: number): Split {
  let left = Math.max(0, gb - included);
  const steps = TIERS.map((t) => {
    const used = Math.min(left, t.size);
    left -= used;
    return used;
  });
  return { included: Math.min(gb, included), steps };
}

export function overage(gb: number, included: number): number {
  const { steps } = split(gb, included);
  return steps.reduce((sum, used, i) => sum + used * (TIERS[i]?.rate ?? 0), 0);
}

// One month on a paid plan: the plan price plus extra data.
export function monthlyPrice(plan: Plan, gb: number): number {
  return (plan.monthly ?? 0) + overage(gb, plan.gb ?? 0);
}

// Pay yearly: 12 months for the price of 10.
export function yearlyPrice(plan: Plan): number {
  return (plan.monthly ?? 0) * 10;
}

export function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function gbText(gb: number): string {
  return gb >= 1000 ? `${(gb / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 })} TB` : `${gb} GB`;
}

export const plan = (id: PlanId): Plan => PLANS.find((p) => p.id === id)!;
