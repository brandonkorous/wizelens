import type { CloudApp } from "../app.js";
import type { EmailContent } from "../mail/content.js";
import { projectBack, projectQuiet } from "../mail/emails-health.js";
import { renderMail } from "../mail/templates.js";
import { stopUrl } from "../mail/unsubscribe.js";
import { managersOf, zonesOf } from "../repo/mail-prefs.js";
import { tenantScope } from "../telemetry/store.js";

const HOUR = 3_600_000;
/** Silence this long counts as quiet, for a project that sends around the clock. */
export const QUIET_MS = 2 * HOUR;
/** "Around the clock": data in at least 58 of the 72 hours before the last data. */
const BUSY_HOURS = 58;

interface ProjectRow {
  id: string;
  org_id: string;
  name: string;
  org: string;
  last_ms: number | null;
  quiet: boolean | null;
  changed_ms: number | null;
}

async function busy(app: CloudApp, p: ProjectRow, lastMs: number): Promise<boolean> {
  return (await app.telemetry.activeHours(tenantScope(p.org_id, [p.id]), lastMs - 72 * HOUR, lastMs)) >= BUSY_HOURS;
}

async function tell(app: CloudApp, p: ProjectRow, make: (stop: string, timeZone?: string) => EmailContent): Promise<void> {
  const people = await managersOf(app.db, p.org_id, "health", app.mailer.live);
  const zones = await zonesOf(app.db, people.map((m) => m.email));
  for (const m of people) app.mailer.send(renderMail(m.email, make(stopUrl(app, m.id, "health"), zones.get(m.email.toLowerCase()))));
}

/** Check one project. The first look only records its state, so an upgrade sends nothing for projects already quiet. */
async function checkProject(app: CloudApp, p: ProjectRow, now: number): Promise<void> {
  if (p.last_ms === null) return;
  const quiet = now - p.last_ms > QUIET_MS && (await busy(app, p, p.last_ms));
  if (p.quiet === quiet) return;
  const saved = await app.db.query(
    `INSERT INTO project_health (project_id, quiet, changed_ms) VALUES ($1, $2, $3)
     ON CONFLICT (project_id) DO UPDATE SET quiet = $2, changed_ms = $3 WHERE project_health.quiet <> $2 RETURNING project_id`,
    [p.id, quiet, now],
  );
  if (p.quiet === null || saved.length === 0) return;
  const url = `${app.baseUrl()}/_wizelens/#/?project=${encodeURIComponent(p.id)}`;
  if (quiet) await tell(app, p, (stop, zone) => projectQuiet(p.name, p.org, p.last_ms!, now, url, stop, zone));
  else await tell(app, p, (stop) => projectBack(p.name, p.org, now - (p.changed_ms ?? now) + QUIET_MS, url, stop));
}

/** Tell owners and admins when a busy project stops sending data, and when it starts again. */
export async function checkHealth(app: CloudApp): Promise<void> {
  const now = app.config.now();
  const projects = await app.db.query<Omit<ProjectRow, "last_ms">>(
    "SELECT p.id, p.org_id, p.name, o.name AS org, h.quiet, h.changed_ms FROM projects p JOIN orgs o ON o.id = p.org_id LEFT JOIN project_health h ON h.project_id = p.id",
  );
  const last = await app.telemetry.lastTraceMs();
  for (const p of projects) await checkProject(app, { ...p, last_ms: last.get(p.id) ?? null }, now);
}
