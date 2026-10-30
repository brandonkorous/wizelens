import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { isOrgRole } from "@wizeworks/lens-core/internal";
import { audit } from "../repo/audit.js";
import { auditScim, billingGuard, rememberScimDelete } from "./billing-hooks.js";
import type { AuthDeps } from "./deps.js";
import { emailChangeOf } from "./email-token.js";
import { isLegacyHash } from "./password.js";
import { rememberPasskey, securityAfter } from "./security-notices.js";
import { guardPasswordWays, noteRequired } from "./sso-required.js";
import { pruneProjectRoles } from "../repo/project-roles.js";
import { clearRemoved, noteRemoved } from "./sso-join.js";

type Mw = Parameters<typeof createAuthMiddleware>[0];
type HookCtx = Parameters<Mw>[0];

const ROLE_PATHS = new Set(["/organization/invite-member", "/organization/update-member-role", "/organization/add-member"]);
const NEEDS_ORG = new Set(["/organization/invite-member", "/organization/update-member-role", "/organization/remove-member", "/organization/update", "/organization/leave"]);
/** Organization changes, as our audit log names them. */
const AUDITED: Record<string, string> = {
  "/organization/update": "org.update",
  "/organization/invite-member": "member.invite",
  "/organization/cancel-invitation": "invite.cancel",
  "/organization/accept-invitation": "member.join",
  "/organization/remove-member": "member.remove",
  "/organization/update-member-role": "member.role",
  "/organization/leave": "member.leave",
};
const SECRET_KEYS = ["password", "newPassword", "currentPassword", "token", "code", "invitationId"];
/** SSO provider changes, as our audit log names them. Their bodies hold client secrets, so only names go in. */
const SSO_AUDITED: Record<string, string> = {
  "/sso/register": "sso.create",
  "/sso/update-provider": "sso.update",
  "/sso/delete-provider": "sso.delete",
  "/sso/verify-domain": "sso.verify",
};
/** The organization of the provider a request changes, found before the change (a deleted provider is gone after). */
const ssoOrgOf = new WeakMap<object, string>();
/** The email of a member being removed or given a new role, found first, so the log and the notice can name them. */
const removedEmailOf = new WeakMap<object, string>();

async function rememberRemoved(ctx: HookCtx, body: Record<string, unknown>): Promise<void> {
  const target = str(body.memberIdOrEmail) ?? str(body.memberId);
  if (!ctx.request || !target) return;
  if (target.includes("@")) return void removedEmailOf.set(ctx.request, target);
  const [row] = await ctx.context.adapter.findMany<{ userId: string }>({ model: "member", where: [{ field: "id", value: target }], limit: 1 });
  const found = row && (await ctx.context.internalAdapter.findUserById(row.userId));
  if (found) removedEmailOf.set(ctx.request, found.email);
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** A cancel sends only the invite id (kept out as a secret), so the log names the invite from the answer. */
function cancelledInvite(ctx: HookCtx): Record<string, unknown> {
  if (ctx.path !== "/organization/cancel-invitation") return {};
  const r = ctx.context.returned as { email?: unknown; role?: unknown } | undefined;
  return { email: str(r?.email), role: str(r?.role) };
}


/** Better Auth signs in whoever opens an email-change link; with 2FA on, that must happen on a device already signed in. */
async function guardEmailChange(ctx: HookCtx): Promise<void> {
  const email = emailChangeOf((ctx.query as Record<string, unknown> | undefined)?.token);
  if (!email || (await getSessionFromCtx(ctx))) return;
  const found = await ctx.context.internalAdapter.findUserByEmail(email);
  if ((found?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled) throw new APIError("UNAUTHORIZED", { message: "Sign in on this device first, then open the link again." });
}

type Config = { pkce?: unknown; wantAssertionsSigned?: unknown } | undefined;

/** SSO providers belong to an organization and have a DNS-safe id; OIDC keeps PKCE and SAML wants signed assertions. New ones say so outright. */
function guardSso(path: string, body: Record<string, unknown>): void {
  const create = path === "/sso/register";
  if (create && !str(body.organizationId)) throw new APIError("BAD_REQUEST", { message: "Send organizationId: SSO providers belong to an organization." });
  if (create && !/^[a-z0-9][a-z0-9-]{1,39}$/.test(str(body.providerId) ?? "")) throw new APIError("BAD_REQUEST", { message: "The provider id is 2 to 40 lowercase letters, digits, and dashes." });
  const oidc = body.oidcConfig as Config;
  const saml = body.samlConfig as Config;
  if (oidc && (create ? oidc.pkce !== true : oidc.pkce === false)) throw new APIError("BAD_REQUEST", { message: "OIDC providers must use PKCE." });
  if (saml && (create ? saml.wantAssertionsSigned !== true : saml.wantAssertionsSigned === false)) throw new APIError("BAD_REQUEST", { message: "SAML providers must sign assertions." });
}

async function rememberSsoOrg(ctx: HookCtx, body: Record<string, unknown>): Promise<void> {
  const providerId = str(body.providerId);
  if (!ctx.request || !providerId) return;
  const row = await ctx.context.adapter.findOne<{ organizationId?: string | null }>({ model: "ssoProvider", where: [{ field: "providerId", value: providerId }] });
  const orgId = str(body.organizationId) ?? row?.organizationId ?? undefined;
  if (orgId) ssoOrgOf.set(ctx.request, orgId);
}

/** One known role per member, the organization always named (never "the active one"), and a password to delete an account. */
const guard: Mw = async (ctx) => {
  if (ctx.path === "/verify-email") return guardEmailChange(ctx);
  if (ctx.path === "/passkey/delete-passkey") return rememberPasskey(ctx);
  if (SSO_AUDITED[ctx.path]) {
    guardSso(ctx.path, (ctx.body ?? {}) as Record<string, unknown>);
    return rememberSsoOrg(ctx, (ctx.body ?? {}) as Record<string, unknown>);
  }
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  if (ROLE_PATHS.has(ctx.path) && body.role !== undefined && !isOrgRole(body.role)) throw new APIError("BAD_REQUEST", { message: "Pick one role: owner, admin, member, or viewer." });
  if (NEEDS_ORG.has(ctx.path) && !str(body.organizationId)) throw new APIError("BAD_REQUEST", { message: "Send organizationId." });
  if (ctx.path === "/delete-user" && !str(body.password) && !str(body.token)) throw new APIError("BAD_REQUEST", { message: "Enter your password." });
  if (ctx.path === "/organization/remove-member" || ctx.path === "/organization/update-member-role") await rememberRemoved(ctx, body);
};

/** A successful sign-in with an old hash stores a new one. */
async function upgradeHash(ctx: HookCtx): Promise<void> {
  const body = ctx.body as { email?: unknown; password?: unknown };
  if (typeof body.email !== "string" || typeof body.password !== "string") return;
  const found = await ctx.context.internalAdapter.findUserByEmail(body.email);
  const account = found && (await ctx.context.internalAdapter.findCredentialAccount(found.user.id));
  if (found && account?.password && isLegacyHash(account.password)) await ctx.context.internalAdapter.updatePassword(found.user.id, await ctx.context.password.hash(body.password));
}

function orgIdOf(ctx: HookCtx): string | undefined {
  const r = ctx.context.returned as { organizationId?: string; member?: { organizationId?: string }; invitation?: { organizationId?: string } } | undefined;
  return str((ctx.body as Record<string, unknown> | undefined)?.organizationId) ?? r?.organizationId ?? r?.member?.organizationId ?? r?.invitation?.organizationId;
}

async function auditOrgChange(deps: AuthDeps, ctx: HookCtx): Promise<void> {
  const action = AUDITED[ctx.path];
  const orgId = action && orgIdOf(ctx);
  if (!action || !orgId) return;
  const actor = (await getSessionFromCtx(ctx))?.user.id;
  const removed = ctx.request && removedEmailOf.get(ctx.request);
  const detail = { ...Object.fromEntries(Object.entries((ctx.body ?? {}) as Record<string, unknown>).filter(([k]) => !SECRET_KEYS.includes(k))), ...(removed ? { memberEmail: removed } : {}), ...cancelledInvite(ctx) };
  await audit(deps.db, orgId, actor ? `user:${actor}` : "system", action, detail, Date.now());
  await pruneProjectRoles(deps.db, orgId);
  await trackRemoval(deps, ctx, orgId, removed || undefined);
}

/** Who was removed or left stays out of single sign-on's joining; an accepted invite or an added member lets them back. */
async function trackRemoval(deps: AuthDeps, ctx: HookCtx, orgId: string, removed: string | undefined): Promise<void> {
  const session = await getSessionFromCtx(ctx);
  if (ctx.path === "/organization/remove-member" && removed) await noteRemoved(deps.db, orgId, removed, Date.now());
  if (ctx.path === "/organization/leave" && session) await noteRemoved(deps.db, orgId, session.user.email, Date.now());
  if (ctx.path === "/organization/accept-invitation" && session) await clearRemoved(deps.db, orgId, session.user.id);
}

async function auditSsoChange(deps: AuthDeps, ctx: HookCtx): Promise<void> {
  const action = SSO_AUDITED[ctx.path];
  const orgId = action && ctx.request && ssoOrgOf.get(ctx.request);
  if (!action || !orgId) return;
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const actor = (await getSessionFromCtx(ctx))?.user.id;
  const detail = { providerId: str(body.providerId), domain: str(body.domain), type: body.samlConfig ? "saml" : body.oidcConfig ? "oidc" : undefined };
  await audit(deps.db, orgId, actor ? `user:${actor}` : "system", action, detail, Date.now());
}

export function authHooks(deps: AuthDeps): BetterAuthOptions["hooks"] {
  return {
    before: createAuthMiddleware(async (ctx) => {
      await billingGuard(deps, ctx);
      await guardPasswordWays(deps.db, ctx.path, (ctx.body ?? {}) as Record<string, unknown>);
      await noteRequired(deps.db, ctx.path, ctx.request);
      await rememberScimDelete(deps, ctx);
      return guard(ctx);
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (isAPIError(ctx.context.returned) || ctx.context.returned instanceof Error) return;
      if (ctx.path === "/sign-in/email") await upgradeHash(ctx);
      await auditOrgChange(deps, ctx);
      await auditSsoChange(deps, ctx);
      await auditScim(deps, ctx);
      await securityAfter(deps, ctx);
    }),
  };
}
