import type { Ctx } from "../app.js";
import { requireOrg, requireUser } from "../auth/principal.js";
import type { Queryable } from "../db/db.js";
import { fail, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { endGrant, type GrantView, grantsOfOrg, grantsOfUser } from "../repo/grants.js";
import { listProjects } from "../repo/projects.js";

/** One connected app as the dashboard lists it. A grant for all projects names none: it reads every project, also new ones. */
export interface AppView {
  id: string;
  app: string;
  clientId: string;
  orgId: string;
  orgName: string;
  userEmail: string;
  allProjects: boolean;
  projects: { id: string; name: string }[];
  createdMs: number;
  usedMs: number | null;
}

async function viewsOf(q: Queryable, grants: GrantView[]): Promise<AppView[]> {
  const names = new Map<string, Map<string, string>>();
  for (const orgId of new Set(grants.map((g) => g.orgId))) names.set(orgId, new Map((await listProjects(q, orgId)).map((p) => [p.id, p.name])));
  return grants.map((g) => {
    const inOrg = names.get(g.orgId)!;
    const projects = g.projectIds.filter((id) => inOrg.has(id)).map((id) => ({ id, name: inOrg.get(id)! }));
    const { id, clientId, orgId, orgName, userEmail, allProjects, createdMs, usedMs } = g;
    return { id, app: g.clientName ?? clientId, clientId, orgId, orgName, userEmail, allProjects, projects, createdMs, usedMs };
  });
}

/** `GET api/me/apps`: the apps this person connected, in every organization. */
async function myApps(ctx: Ctx): Promise<void> {
  const user = await requireUser(ctx);
  sendJson(ctx.res, 200, { apps: await viewsOf(ctx.app.db, await grantsOfUser(ctx.app.db, user.id)) });
}

/** `GET api/orgs/{org}/apps`: every app the organization's people connected. Admins. */
async function orgApps(ctx: Ctx): Promise<void> {
  await requireOrg(ctx, ctx.params.org!, "manage");
  sendJson(ctx.res, 200, { apps: await viewsOf(ctx.app.db, await grantsOfOrg(ctx.app.db, ctx.params.org!)) });
}

/** End one grant and write it to the audit log. The app's tokens stop at once. */
async function disconnect(ctx: Ctx, grant: GrantView | undefined, by: string): Promise<void> {
  if (!grant) return fail(404, "App not found.");
  const now = ctx.app.config.now();
  await ctx.app.db.tx(async (q) => {
    await endGrant(q, grant.id, now);
    await audit(q, grant.orgId, by, "app.disconnect", { app: grant.clientName ?? grant.clientId, clientId: grant.clientId, grantId: grant.id, userEmail: grant.userEmail }, now);
  });
  sendJson(ctx.res, 200, { ok: true });
}

/** `DELETE api/me/apps/{id}`: the person ends one of their own. */
async function dropMine(ctx: Ctx): Promise<void> {
  const user = await requireUser(ctx);
  const grant = (await grantsOfUser(ctx.app.db, user.id)).find((g) => g.id === ctx.params.id);
  await disconnect(ctx, grant, `user:${user.id}`);
}

/** `DELETE api/orgs/{org}/apps/{id}`: an admin ends anyone's grant in the organization. */
async function dropInOrg(ctx: Ctx): Promise<void> {
  const { user } = await requireOrg(ctx, ctx.params.org!, "manage");
  const grant = (await grantsOfOrg(ctx.app.db, ctx.params.org!)).find((g) => g.id === ctx.params.id);
  await disconnect(ctx, grant, `user:${user.id}`);
}

export function appRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/me/apps", myApps).on("DELETE", "api/me/apps/:id", dropMine).on("GET", "api/orgs/:org/apps", orgApps).on("DELETE", "api/orgs/:org/apps/:id", dropInOrg);
}
