import type { CloudApp } from "../app.js";
import { orgDeleted, roleChanged, teamChanges } from "../mail/emails-team.js";
import { renderMail } from "../mail/templates.js";
import { stopUrl } from "../mail/unsubscribe.js";
import { managersOf } from "../repo/mail-prefs.js";
import { type AuditRow, describe, NOTICED, namesOf, type Names } from "./team-describe.js";

const BATCH = 200;

/** Take audit lines nobody was told about yet. SKIP LOCKED lets several instances share the work without sending twice. */
async function claim(app: CloudApp): Promise<AuditRow[]> {
  return app.db.query<AuditRow>(
    `UPDATE audit SET noticed = TRUE WHERE id IN (SELECT id FROM audit WHERE NOT noticed ORDER BY time_ms LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)
     RETURNING id, org_id, actor, action, detail, time_ms`,
  );
}

const auditLink = (app: CloudApp, orgId: string) => `${app.baseUrl()}/_wizelens/#/team?org=${encodeURIComponent(orgId)}`;

/** A member whose role changed hears it from us too, even when they are not a manager. */
async function tellRoleChange(app: CloudApp, row: AuditRow, org: string): Promise<void> {
  const d = JSON.parse(row.detail) as { memberId?: string; role?: string };
  const [m] = await app.db.query<{ user_id: string; email: string; team: boolean | null }>(
    "SELECT m.user_id, u.email, p.team FROM members m JOIN users u ON u.id = m.user_id LEFT JOIN mail_prefs p ON p.user_id = u.id WHERE m.id = $1",
    [d.memberId ?? ""],
  );
  if (!m || m.team === false || row.actor === `user:${m.user_id}`) return;
  app.mailer.send(renderMail(m.email, roleChanged(org, d.role ?? "member", auditLink(app, row.org_id), stopUrl(app, m.user_id, "team"))));
}

/** One email per manager with the changes others made in that organization. */
async function noticeOrg(app: CloudApp, orgId: string, rows: AuditRow[], names: Names): Promise<void> {
  const [o] = await app.db.query<{ name: string }>("SELECT name FROM orgs WHERE id = $1", [orgId]);
  if (!o) return;
  for (const row of rows.filter((r) => r.action === "member.role")) await tellRoleChange(app, row, o.name);
  const changes = await Promise.all(rows.map(async (r) => ({ actor: r.actor, text: await describe(r, names), timeMs: r.time_ms })));
  for (const m of await managersOf(app.db, orgId, "team", app.mailer.live)) {
    const theirs = changes.filter((c) => c.actor !== `user:${m.id}`);
    if (theirs.length) app.mailer.send(renderMail(m.email, teamChanges(o.name, theirs, auditLink(app, orgId), stopUrl(app, m.id, "team"))));
  }
}

/** Send team notices for new audit lines, grouped by organization. Returns how many lines it took. */
export async function sendTeamNotices(app: CloudApp): Promise<number> {
  const rows = (await claim(app)).sort((a, b) => a.time_ms - b.time_ms);
  const byOrg = new Map<string, AuditRow[]>();
  for (const r of rows.filter((r) => NOTICED.has(r.action))) byOrg.set(r.org_id, [...(byOrg.get(r.org_id) ?? []), r]);
  const names = namesOf(app.db);
  for (const [orgId, list] of byOrg) await noticeOrg(app, orgId, list, names);
  return rows.length;
}

/** Before an organization is deleted: who to tell, since members are gone after. */
export async function orgDeletionNotice(app: CloudApp, orgId: string, actorId: string): Promise<() => void> {
  const [o] = await app.db.query<{ name: string }>("SELECT name FROM orgs WHERE id = $1", [orgId]);
  const people = await app.db.query<{ email: string }>("SELECT u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 AND u.id <> $2", [orgId, actorId]);
  const by = await namesOf(app.db).user(actorId);
  return () => {
    for (const p of people) app.mailer.send(renderMail(p.email, orgDeleted(o?.name ?? "An organization", by, `${app.baseUrl()}/_wizelens/`)));
  };
}
