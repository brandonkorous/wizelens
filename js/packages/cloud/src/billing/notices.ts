import type { CloudApp } from "../app.js";
import type { EmailContent } from "../mail/content.js";
import { spendCapReached, usageNotice } from "../mail/emails-billing.js";
import { renderMail } from "../mail/templates.js";
import type { UsageState } from "./limits.js";
import { monthOf } from "./usage.js";

// Mail to owners and admins at 80% and 100% of the included GB, and when the spend cap stops ingest: once a month each.

/** True the first time this organization reaches `kind` this month, on any instance. */
async function claim(app: CloudApp, orgId: string, month: string, kind: string): Promise<boolean> {
  const rows = await app.db.query("INSERT INTO usage_notices (org_id, month, kind, sent_ms) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING org_id", [orgId, month, kind, app.config.now()]);
  return rows.length > 0;
}

async function tell(app: CloudApp, orgId: string, content: EmailContent): Promise<void> {
  const people = await app.db.query<{ email: string }>(
    "SELECT u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 AND m.role IN ('owner', 'admin') AND (u.email_verified OR NOT $2) ORDER BY u.email",
    [orgId, app.mailer.live],
  );
  for (const p of people) app.mailer.send(renderMail(p.email, content));
}

async function checkOrg(app: CloudApp, org: { id: string; name: string }, month: string, url: string): Promise<void> {
  const s: UsageState | null = await app.billing.limits.state(org.id);
  const included = s?.limits.includedGb;
  if (!s || !included) return;
  const percent = (s.monthGb / included) * 100;
  const notice = (level: number) => usageNotice({ org: org.name, plan: s.limits.plan.name, usedGb: s.monthGb, includedGb: included, percent: level, overage: s.limits.plan.overage, url });
  // At 100%, the 80% notice counts as sent, so a fast month never sends both.
  if (percent >= 100 && (await claim(app, org.id, month, "mail100"))) await claim(app, org.id, month, "mail80").then(() => tell(app, org.id, notice(100)));
  else if (percent >= 80 && (await claim(app, org.id, month, "mail80"))) await tell(app, org.id, notice(80));
  if (s.reason === "cap" && (await claim(app, org.id, month, "mail-cap"))) await tell(app, org.id, spendCapReached(org.name, (s.billing.spendCapCents ?? 0) / 100, url));
}

/** Every organization that sent data this month. Runs after each usage flush. */
export async function sendUsageNotices(app: CloudApp): Promise<void> {
  if (!app.billing.on) return;
  const month = monthOf(app.config.now());
  const orgs = await app.db.query<{ id: string; name: string }>(
    "SELECT o.id, o.name FROM orgs o WHERE o.plan IN ('free', 'team', 'business', 'enterprise') AND EXISTS (SELECT 1 FROM usage_daily u WHERE u.org_id = o.id AND u.day LIKE $1)",
    [`${month}-%`],
  );
  // The link names the organization, so a person in several opens this one's billing.
  const url = (orgId: string) => `${app.baseUrl()}/_wizelens/#/organization/billing?org=${encodeURIComponent(orgId)}`;
  for (const org of orgs) await checkOrg(app, org, month, url(org.id));
}
