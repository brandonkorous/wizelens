import type { Ctx } from "../app.js";
import { principalOf, requireUser, SESSION_COOKIE } from "../auth/principal.js";
import { cookie, cookieOf, fail, readJsonBody, sendJson, str } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { acceptInvite, createOrg, openInvite, orgsOfUser } from "../repo/orgs.js";
import { createProject, listProjects } from "../repo/projects.js";
import { createSession, createUser, endSession, signUpProblem, type User, userByEmail, userCount, verifyLogin } from "../repo/users.js";

const MAX_AGE_S = 30 * 24 * 60 * 60;

async function signIn(ctx: Ctx, user: User, status = 200): Promise<void> {
  const { token } = await createSession(ctx.app.db, user.id, ctx.app.config.now());
  const set = cookie(SESSION_COOKIE, token, MAX_AGE_S, ctx.app.config.secureCookies);
  sendJson(ctx.res, status, { user }, { "Set-Cookie": set });
}

/** The signed-in person with their organizations and each one's projects. */
async function meOf(ctx: Ctx, user: User) {
  const orgs = await orgsOfUser(ctx.app.db, user.id);
  const withProjects = await Promise.all(orgs.map(async (o) => ({ ...o, projects: await listProjects(ctx.app.db, o.id) })));
  return { user, orgs: withProjects };
}

async function state(ctx: Ctx): Promise<void> {
  const p = await principalOf(ctx);
  const needsSetup = (await userCount(ctx.app.db)) === 0;
  const me = p?.kind === "user" ? await meOf(ctx, p.user) : null;
  sendJson(ctx.res, 200, { signedIn: !!me, needsSetup, signup: ctx.app.config.signup, ...(me ?? {}) });
}

/** The first account: creates the person, their organization, and a first project. Only while no account exists. */
async function setup(ctx: Ctx): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const [email, password, name] = [str(body, "email"), str(body, "password"), str(body, "name")];
  const problem = signUpProblem(email, password, name);
  if (problem) fail(400, problem);
  const now = ctx.app.config.now();
  const user = await ctx.app.db.tx(async (q) => {
    if ((await userCount(q)) > 0) fail(409, "Setup is already done. Sign in instead.");
    const u = await createUser(q, email, password, name, now);
    const org = await createOrg(q, str(body, "orgName", false) || `${name.trim()}'s team`, u.id, now, ctx.app.config.retentionDays);
    await createProject(q, org.id, str(body, "projectName", false) || "My app", now);
    await audit(q, org.id, `user:${u.id}`, "org.create", { name: org.name }, now);
    return u;
  });
  await signIn(ctx, user, 201);
}

/** A new account. Needs an invite, unless sign-up is open (then it gets its own organization). */
async function signup(ctx: Ctx): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const [email, password, name, invite] = [str(body, "email"), str(body, "password"), str(body, "name"), str(body, "invite", false)];
  const problem = signUpProblem(email, password, name);
  if (problem) fail(400, problem);
  const now = ctx.app.config.now();
  if (!invite && ctx.app.config.signup !== "open") fail(403, "Sign-up needs an invite link.");
  if (await userByEmail(ctx.app.db, email)) fail(409, "An account with this email exists. Sign in instead.");
  const user = await ctx.app.db.tx(async (q) => {
    const open = invite ? await openInvite(q, invite, now) : undefined;
    if (invite && !open) fail(410, "This invite link is not valid any more.");
    const u = await createUser(q, email, password, name, now);
    if (open) await acceptInvite(q, invite, u.id, now);
    else await createProject(q, (await createOrg(q, `${name.trim()}'s team`, u.id, now, ctx.app.config.retentionDays)).id, "My app", now);
    return u;
  });
  await signIn(ctx, user, 201);
}

async function login(ctx: Ctx): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const user = await verifyLogin(ctx.app.db, str(body, "email"), str(body, "password"));
  if (!user) fail(401, "The email or password is not right.");
  await signIn(ctx, user!);
}

async function logout(ctx: Ctx): Promise<void> {
  const token = cookieOf(ctx.req, SESSION_COOKIE);
  if (token) await endSession(ctx.app.db, token);
  sendJson(ctx.res, 200, { ok: true }, { "Set-Cookie": cookie(SESSION_COOKIE, "", 0, ctx.app.config.secureCookies) });
}

async function showInvite(ctx: Ctx): Promise<void> {
  const invite = await openInvite(ctx.app.db, ctx.params.token!, ctx.app.config.now());
  if (!invite) fail(404, "This invite link is not valid any more.");
  sendJson(ctx.res, 200, { orgName: invite!.orgName, email: invite!.email, role: invite!.role });
}

/** A signed-in person joins with an invite link. */
async function joinInvite(ctx: Ctx): Promise<void> {
  const user = await requireUser(ctx);
  const invite = await acceptInvite(ctx.app.db, ctx.params.token!, user.id, ctx.app.config.now());
  if (!invite) fail(410, "This invite link is not valid any more.");
  await audit(ctx.app.db, invite!.orgId, `user:${user.id}`, "member.join", { role: invite!.role }, ctx.app.config.now());
  sendJson(ctx.res, 200, await meOf(ctx, user));
}

export function authRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/auth/state", state)
    .on("POST", "api/auth/setup", setup)
    .on("POST", "api/auth/signup", signup)
    .on("POST", "api/auth/login", login)
    .on("POST", "api/auth/logout", logout)
    .on("GET", "api/auth/invites/:token", showInvite)
    .on("POST", "api/auth/invites/:token/accept", joinInvite);
}
