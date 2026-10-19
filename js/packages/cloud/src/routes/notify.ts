import type { Ctx } from "../app.js";
import { requireUser } from "../auth/principal.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { DEFAULT_DIGEST, DIGEST_PERIODS, type DigestPeriod, digestPrefsOf, type MailPrefs, prefsOf, saveDigestPref, savePrefs } from "../repo/mail-prefs.js";
import { VISIBLE_TO_MEMBER } from "../repo/project-roles.js";

const validZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz.length <= 64;
  } catch {
    return false;
  }
};

/** Projects this person can see, each with its digest choices. */
async function projectsOf(ctx: Ctx, userId: string) {
  const rows = await ctx.app.db.query<{ id: string; name: string; org_id: string; org: string; role: string }>(
    `SELECT p.id, p.name, p.org_id, o.name AS org, m.role FROM members m JOIN orgs o ON o.id = m.org_id JOIN projects p ON p.org_id = o.id
     WHERE m.user_id = $1 AND ${VISIBLE_TO_MEMBER} ORDER BY o.name, p.name`,
    [userId],
  );
  const prefs = await digestPrefsOf(ctx.app.db, userId);
  return rows.map((r) => ({ projectId: r.id, project: r.name, orgId: r.org_id, org: r.org, role: r.role, ...(prefs.get(r.id) ?? DEFAULT_DIGEST) }));
}

/** `GET api/me/notifications`: which emails this person gets. Security notices are always on, so they are not listed. */
async function show(ctx: Ctx): Promise<void> {
  const user = await requireUser(ctx);
  sendJson(ctx.res, 200, { mail: ctx.app.mailer.live, ...(await prefsOf(ctx.app.db, user.id)), projects: await projectsOf(ctx, user.id) });
}

function prefsPatch(b: Record<string, unknown>): Partial<MailPrefs> {
  const out: Partial<MailPrefs> = {};
  for (const k of ["team", "health", "digests"] as const) if (typeof b[k] === "boolean") out[k] = b[k];
  if (b.timeZone !== undefined) out.timeZone = typeof b.timeZone === "string" && validZone(b.timeZone) ? b.timeZone : fail(400, "Pick a time zone such as America/Los_Angeles.");
  if (b.digestHour !== undefined) out.digestHour = Number.isInteger(b.digestHour) && Number(b.digestHour) >= 0 && Number(b.digestHour) <= 23 ? Number(b.digestHour) : fail(400, "Pick an hour from 0 to 23.");
  return out;
}

/** `PATCH api/me/notifications`: change only the fields sent. Projects must be ones this person can see. */
async function change(ctx: Ctx): Promise<void> {
  const user = await requireUser(ctx);
  const body = await readJsonBody(ctx.req);
  const patch = prefsPatch(body);
  const visible = new Set((await projectsOf(ctx, user.id)).map((p) => p.projectId));
  const projects = Array.isArray(body.projects) ? (body.projects as Record<string, unknown>[]) : [];
  if (projects.some((p) => typeof p?.projectId !== "string" || !visible.has(p.projectId))) fail(404, "Project not found.");
  if (Object.keys(patch).length) await savePrefs(ctx.app.db, user.id, patch);
  for (const p of projects) {
    const periods = Object.fromEntries(DIGEST_PERIODS.filter((k) => typeof p[k] === "boolean").map((k) => [k, p[k] as boolean])) as Partial<Record<DigestPeriod, boolean>>;
    await saveDigestPref(ctx.app.db, user.id, p.projectId as string, periods);
  }
  await show(ctx);
}

export function notifyRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/me/notifications", show).on("PATCH", "api/me/notifications", change);
}
