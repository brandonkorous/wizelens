import type { Ctx } from "../app.js";
import { requireOrg } from "../auth/principal.js";
import { requireFeature } from "../billing/gate.js";
import { isPaidPlan } from "../billing/plans.js";
import { usageSummary } from "../billing/summary.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit, auditFilterOf, listAudit } from "../repo/audit.js";
import { orgBilling, setSpendCap } from "../repo/billing.js";

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

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The audit log as CSV or JSON (Business and Enterprise), with the log's filter (`action`, `actor`, `before`, `from`). The export itself goes in the log too. */
async function auditExport(ctx: Ctx): Promise<void> {
  const { user } = await requireOrg(ctx, ctx.params.org!, "manage");
  await requireFeature(ctx.app, ctx.params.org!, "auditExport");
  const format = ctx.url.searchParams.get("format") === "json" ? "json" : "csv";
  const filter = auditFilterOf(ctx.url.searchParams);
  await audit(ctx.app.db, ctx.params.org!, `user:${user.id}`, "audit.export", { format, ...filter }, ctx.app.config.now());
  const rows = await listAudit(ctx.app.db, ctx.params.org!, 100_000, filter);
  const name = `wizelens-audit-${new Date(ctx.app.config.now()).toISOString().slice(0, 10)}.${format}`;
  const body =
    format === "json"
      ? JSON.stringify(rows.map((r) => ({ time: new Date(r.timeMs).toISOString(), ...r })))
      : ["time,actor,action,detail", ...rows.map((r) => [new Date(r.timeMs).toISOString(), r.actor, r.action, JSON.stringify(r.detail)].map(csvCell).join(","))].join("\n");
  ctx.res.writeHead(200, { "Content-Type": format === "json" ? "application/json" : "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" });
  ctx.res.end(body);
}

export function billingRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/orgs/:org/usage", usage).on("PATCH", "api/orgs/:org/billing", changeBilling).on("GET", "api/orgs/:org/audit/export", auditExport);
}
