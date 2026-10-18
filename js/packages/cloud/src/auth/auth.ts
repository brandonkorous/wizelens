import { betterAuth, type BetterAuthOptions } from "better-auth";
import { audit } from "../repo/audit.js";
import { freeSlug } from "../repo/orgs.js";
import { createProject } from "../repo/projects.js";
import { beforeDeleteUser } from "./delete-user.js";
import type { AuthDeps } from "./deps.js";
import { authHooks } from "./hooks.js";
import { advancedOptions, AUTH_BASE_PATH, passwordAuth, rateLimitOptions, sessionOptions, userOptions } from "./options.js";
import { authPlugins } from "./plugins.js";
import { afterSignup, confirmSsoEmail } from "./signup.js";

const ALWAYS_OFF = ["/sign-in/social", "/link-social", "/get-access-token", "/refresh-token", "/account-info", "/delete-user/callback", "/update-session"];

/** Invite ids are link secrets: no route lists them (managers see them on our Team page), nor, without real mail, by "their" email. */
const disabledPaths = (deps: AuthDeps) => [
  ...ALWAYS_OFF,
  "/organization/list-invitations",
  "/organization/get-full-organization",
  ...(deps.mailer.live ? [] : ["/organization/list-user-invitations"]),
];

function build(deps: AuthDeps, createOrg: (userId: string, name: string) => Promise<{ id: string }>) {
  return betterAuth({
    appName: "WizeLens",
    baseURL: deps.publicUrl,
    basePath: AUTH_BASE_PATH,
    secrets: deps.secrets,
    trustedOrigins: [...deps.trustedOrigins, ...deps.ssoOrigins],
    telemetry: { enabled: false },
    disabledPaths: disabledPaths(deps),
    database: deps.db.authDatabase,
    user: userOptions(deps, beforeDeleteUser(deps.db)),
    ...passwordAuth(deps),
    ...sessionOptions(),
    rateLimit: rateLimitOptions(),
    advanced: advancedOptions(deps),
    databaseHooks: { user: { create: { before: confirmSsoEmail, after: afterSignup(deps, createOrg) } } },
    hooks: authHooks(deps),
    plugins: authPlugins(deps),
  });
}

/** The parts of Better Auth the cloud calls itself; the dashboard reaches the rest through `api/auth/*`. */
export interface WizeAuth {
  handler: (request: Request) => Promise<Response>;
  options: BetterAuthOptions;
  api: {
    getSession(a: { headers: Headers }): Promise<{ user: SessionUser; session: { id: string } } | null>;
    verifyPassword(a: { body: { password: string }; headers: Headers }): Promise<unknown>;
    createOrganization(a: { body: { name: string; slug: string; userId: string } }): Promise<{ id: string; name: string; slug: string } | null>;
  };
}

interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  twoFactorEnabled?: boolean | null;
}

/** Better Auth for the cloud: accounts, sessions, 2FA, passkeys, SSO, organizations, members, and invites (docs/CONTRACT.md, "Tenancy and access"). */
export function createAuth(deps: AuthDeps): WizeAuth {
  const auth = build(deps, (userId, name) => createOrgFor(auth, deps, userId, name)) as unknown as WizeAuth;
  return auth;
}

/** A new organization with `userId` as owner, the cloud's default retention, a first project, and an audit line. */
export async function createOrgFor(auth: WizeAuth, deps: Pick<AuthDeps, "db" | "retentionDays">, userId: string, name: string): Promise<{ id: string; name: string; slug: string }> {
  const clean = name.trim().slice(0, 100) || "My organization";
  const org = await auth.api.createOrganization({ body: { name: clean, slug: await freeSlug(deps.db, clean), userId } });
  if (!org) throw new Error("Could not create the organization.");
  const now = Date.now();
  await deps.db.tx(async (q) => {
    await q.query("UPDATE orgs SET retention_days = $1 WHERE id = $2", [deps.retentionDays, org.id]);
    await createProject(q, org.id, "My app", now);
    await audit(q, org.id, `user:${userId}`, "org.create", { name: clean }, now);
  });
  return { id: org.id, name: org.name, slug: org.slug };
}
