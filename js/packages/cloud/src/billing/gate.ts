import type { CloudApp } from "../app.js";
import { HttpError } from "../http/http.js";
import { orgHas, orgLimits } from "../repo/billing.js";
import { type Feature, PLANS, planFor } from "./plans.js";

export const FEATURE_NAME: Record<Feature, string> = { sso: "Single sign-on", scim: "SCIM provisioning", auditExport: "Audit log export" };

/** What a 402 says: the feature, and the plan it needs. */
export function planRequired(feature: Feature): { message: string; plan: string } {
  const plan = planFor(feature);
  return { message: `${FEATURE_NAME[feature]} needs the ${PLANS[plan].name} plan. Upgrade on the Billing page.`, plan };
}

/** 402 with the plan it needs, unless the organization's plan has the feature (always, with billing off). */
export async function requireFeature(app: CloudApp, orgId: string, feature: Feature): Promise<void> {
  if (await orgHas(app.db, orgId, app.billing.on, feature)) return;
  const { message, plan } = planRequired(feature);
  throw new HttpError(402, message, { plan, feature });
}

/** The cheapest plan that keeps data `days` long. */
const planForDays = (days: number) => (["team", "business", "enterprise"] as const).find((p) => PLANS[p].maxRetentionDays >= days) ?? "enterprise";

/** 402 when the retention is longer than the plan allows. */
export async function requireRetention(app: CloudApp, orgId: string, days: number): Promise<void> {
  const limits = await orgLimits(app.db, orgId, app.billing.on);
  if (days <= limits.maxRetentionDays) return;
  const plan = planForDays(days);
  throw new HttpError(402, `The ${limits.plan.name} plan keeps data up to ${limits.maxRetentionDays} days. ${days} days needs the ${PLANS[plan].name} plan.`, { plan, maxRetentionDays: limits.maxRetentionDays });
}
