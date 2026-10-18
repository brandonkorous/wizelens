import { fromNodeHeaders } from "better-auth/node";
import type { Ctx } from "../app.js";
import { bearerOf, fail, HttpError } from "../http/http.js";
import { membership } from "../repo/orgs.js";
import { type ApiKey, keyByToken, type Project, projectInOrg } from "../repo/projects.js";
import type { User } from "../repo/users.js";
import { can, type Permission, type Role } from "./roles.js";

/** Who is calling: a signed-in person (a Better Auth session), or a read key (AI agents and scripts). */
export type Principal = { kind: "user"; user: User; sessionId: string } | { kind: "key"; key: ApiKey & { orgId: string } };

/** The session of this request, read from the database each time (no cookie cache), so a revoked session stops at once. */
export async function sessionOf(ctx: Ctx): Promise<{ user: User; sessionId: string } | undefined> {
  const s = await ctx.app.auth.api.getSession({ headers: fromNodeHeaders(ctx.req.headers) });
  if (!s) return undefined;
  const { id, email, name, emailVerified } = s.user;
  return { user: { id, email, name, emailVerified, twoFactorEnabled: !!s.user.twoFactorEnabled }, sessionId: s.session.id };
}

export async function principalOf(ctx: Ctx): Promise<Principal | undefined> {
  const bearer = bearerOf(ctx.req);
  if (bearer?.startsWith("wl_rk_")) {
    const key = await keyByToken(ctx.app.db, bearer, ctx.app.config.now());
    return key?.kind === "read" ? { kind: "key", key } : undefined;
  }
  const s = await sessionOf(ctx);
  return s ? { kind: "user", ...s } : undefined;
}

/** A signed-in person, or 401. Changes also need the dashboard header, so other sites cannot send them. */
export async function requireUser(ctx: Ctx): Promise<User> {
  const p = await principalOf(ctx);
  if (p?.kind !== "user") return fail(401, "Sign in first.");
  const method = ctx.req.method ?? "GET";
  if (method !== "GET" && ctx.req.headers["x-wizelens-client"] !== "dashboard") fail(403, "Missing the X-WizeLens-Client header.");
  return p.user;
}

/** The caller's role in an organization, when it allows `permission`; otherwise 403 (or 404 when not a member). */
export async function requireOrg(ctx: Ctx, orgId: string, permission: Permission): Promise<{ user: User; role: Role }> {
  const user = await requireUser(ctx);
  const m = await membership(ctx.app.db, user.id, orgId);
  if (!m) fail(404, "Organization not found.");
  if (!can(m!.role, permission)) fail(403, `Your role (${m!.role}) cannot do this.`);
  return { user, role: m!.role };
}

export interface ProjectAccess {
  project: Project;
  /** "user:<id>" or "key:<id>", for the audit log. */
  actor: string;
  role: Role;
  principal: Principal;
}

/** Access to one project's data, for a person or a read key. */
export async function requireProject(ctx: Ctx, projectId: string, permission: Permission = "read"): Promise<ProjectAccess> {
  const p = await principalOf(ctx);
  if (!p) return fail(401, "Sign in, or send a read key.");
  if (p.kind === "key") return keyAccess(ctx, p, projectId, permission);
  const [row] = await ctx.app.db.query<{ org_id: string }>("SELECT org_id FROM projects WHERE id = $1", [projectId]);
  const m = row ? await membership(ctx.app.db, p.user.id, row.org_id) : undefined;
  const project = m ? await projectInOrg(ctx.app.db, m.id, projectId) : undefined;
  if (!m || !project) return fail(404, "Project not found.");
  if (!can(m.role, permission)) fail(403, `Your role (${m.role}) cannot do this.`);
  if (permission !== "read") await requireUser(ctx);
  return { project, actor: `user:${p.user.id}`, role: m.role, principal: p };
}

async function keyAccess(ctx: Ctx, p: Principal & { kind: "key" }, projectId: string, permission: Permission): Promise<ProjectAccess> {
  if (permission !== "read") throw new HttpError(403, "Read keys can only read.");
  const project = p.key.projectIds.includes(projectId) ? await projectInOrg(ctx.app.db, p.key.orgId, projectId) : undefined;
  if (!project) return fail(404, "Project not found.");
  return { project, actor: `key:${p.key.id}`, role: "viewer", principal: p };
}
