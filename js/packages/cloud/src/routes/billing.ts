import type { Ctx } from "../app.js";
import { requireOrg } from "../auth/principal.js";
import { isPaidPlan } from "../billing/plans.js";
import { usageSummary } from "../billing/summary.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { orgBilling, setSpendCap } from "../repo/billing.js";
import { auditExport } from "./audit-export.js";

/** Everyone in the organization sees its usage (the banner); owners and admins also see the Billing page. */
async function usage(ctx: Ctx): Promise<void> {
  await requireOrg(ctx, ctx.params.org!, "read");
  const summary = await usageSummary(ctx.app, ctx.params.org!);
  if (!summary) return fail(404, "Organization not found.");
  sendJson(ctx.res, 200, summary);
}

/** Owners set or clear the monthly overage limit, in whole dollars (Team and Business). */
async function changeBilling(ctx: Ctx): Promise<void> {
  const { user } = await requireOrg(ctx, ctx.params.org!, "own");
  if (!ctx.app.billing.on) fail(404, "Billing is off on this cloud.");
  const body = await readJsonBody(ctx.req);
  const cap = body.spendCapUsd;
  if (cap !== null && (!Number.isInteger(cap) || (cap as number) < 0 || (cap as number) > 1_000_000)) fail(400, "The spend cap is a whole number of dollars, 0 to 1000000, or null for none.");
  const b = await orgBilling(ctx.app.db, ctx.params.org!);
  if (!isPaidPlan(b?.plan)) fail(400, "A spend cap is for the Team and Business plans.");
  await setSpendCap(ctx.app.db, ctx.params.org!, cap === null ? null : (cap as number) * 100, `user:${user.id}`, ctx.app.config.now());
  ctx.app.billing.forget(ctx.params.org!);
  sendJson(ctx.res, 200, { ok: true });
}

export function billingRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/orgs/:org/usage", usage).on("PATCH", "api/orgs/:org/billing", changeBilling).on("GET", "api/orgs/:org/audit/export", auditExport);
}
