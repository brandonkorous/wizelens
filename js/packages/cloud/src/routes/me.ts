import type { Ctx } from "../app.js";
import { blockingOrgs, ownedOrgs } from "../auth/delete-user.js";
import { sessionOf } from "../auth/principal.js";
import { fail, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { orgsOfUser } from "../repo/orgs.js";
import { listProjects } from "../repo/projects.js";
import { userCount } from "../repo/users.js";

/** The signed-in person's organizations, each with its projects. */
async function orgsWithProjects(ctx: Ctx, userId: string) {
  const orgs = await orgsOfUser(ctx.app.db, userId);
  return Promise.all(orgs.map(async (o) => ({ ...o, projects: await listProjects(ctx.app.db, o.id) })));
}

/** True once any organization has an SSO provider with a proven domain, so the sign-in page offers single sign-on. */
async function ssoReady(ctx: Ctx): Promise<boolean> {
  const [row] = await ctx.app.db.query<{ ready: boolean }>("SELECT EXISTS (SELECT 1 FROM sso_providers WHERE domain_verified) AS ready");
  return row?.ready === true;
}

/** Who is signed in, whether setup is needed, how sign-up works, whether mail goes out, and whether SSO is on. Sign-in itself is Better Auth's (api/auth/). */
async function me(ctx: Ctx): Promise<void> {
  const s = await sessionOf(ctx);
  const base = { signedIn: !!s, needsSetup: (await userCount(ctx.app.db)) === 0, signup: ctx.app.config.signup, mail: ctx.app.mailer.live, sso: await ssoReady(ctx) };
  if (!s) return sendJson(ctx.res, 200, base);
  const owned = await ownedOrgs(ctx.app.db, s.user.id);
  sendJson(ctx.res, 200, { ...base, user: s.user, sessionId: s.sessionId, orgs: await orgsWithProjects(ctx, s.user.id), blockingOrgs: blockingOrgs(owned).map((o) => o.name) });
}

/** Who sent an invite and for which email, so the sign-up form can show it. The id is the link's secret. */
async function invitePreview(ctx: Ctx): Promise<void> {
  const [row] = await ctx.app.db.query<{ orgName: string; email: string; role: string; inviter: string }>(
    `SELECT o.name AS "orgName", i.email, i.role, u.name AS inviter FROM invites i JOIN orgs o ON o.id = i.org_id JOIN users u ON u.id = i.inviter_id
     WHERE i.id = $1 AND i.status = 'pending' AND i.expires_at > now()`,
    [ctx.params.id!],
  );
  if (!row) return fail(404, "This invite link is not valid any more.");
  sendJson(ctx.res, 200, row);
}

export function meRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/me", me).on("GET", "api/invites/:id", invitePreview);
}
