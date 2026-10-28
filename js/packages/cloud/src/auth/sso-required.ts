import type { DBTransactionAdapter } from "better-auth";
import { APIError } from "better-auth/api";
import type { Queryable } from "../db/db.js";

// "Require single sign-on" on a proven domain: people at that domain sign in only through the provider. Owners keep their password, to get in when the provider is down.

/** Ways in that skip the identity provider. Sign-up is refused for everyone at the domain; the others let owners through. */
const PASSWORD_PATHS = new Set(["/sign-in/email", "/request-password-reset"]);

export interface Required {
  orgId: string;
  providerId: string;
  domain: string;
}

/** The provider that requires single sign-on for this email's domain, if any. */
export async function ssoRequiredFor(q: Queryable, email: string): Promise<Required | null> {
  const at = email.trim().toLowerCase().split("@")[1] ?? "";
  if (!at) return null;
  const [row] = await q.query<{ org_id: string; provider_id: string }>(
    `SELECT org_id, provider_id FROM sso_providers
     WHERE sso_required AND domain_verified AND $1 = ANY (string_to_array(replace(lower(domain), ' ', ''), ','))
     ORDER BY provider_id LIMIT 1`,
    [at],
  );
  return row ? { orgId: row.org_id, providerId: row.provider_id, domain: at } : null;
}

async function isOwner(q: Queryable, orgId: string, email: string): Promise<boolean> {
  const rows = await q.query("SELECT 1 FROM members m JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 AND lower(u.email) = lower($2) AND m.role = 'owner'", [orgId, email]);
  return rows.length > 0;
}

const refuse = (r: Required) =>
  new APIError("FORBIDDEN", { message: `People at ${r.domain} sign in with single sign-on. Choose "Sign in with SSO" and enter your ${r.domain} email.`, code: "SSO_REQUIRED" });

/** Before a password sign-in, sign-up, or reset: refuse it for a domain that requires single sign-on. */
export async function guardPasswordWays(q: Queryable, path: string, body: Record<string, unknown>): Promise<void> {
  if (path !== "/sign-up/email" && !PASSWORD_PATHS.has(path)) return;
  const email = typeof body.email === "string" ? body.email : "";
  const r = email ? await ssoRequiredFor(q, email) : null;
  if (r && (path === "/sign-up/email" || !(await isOwner(q, r.orgId, email)))) throw refuse(r);
}

/** The domains that require single sign-on, read before a request starts: session hooks run inside Better Auth's transaction. */
const requiredOf = new WeakMap<object, Required[]>();
/** The same list from the latest request, for the SSO callback's user resolver (it gets no request). */
let latest: Required[] = [];

/** Before any auth request: note which domains require single sign-on. */
export async function noteRequired(q: Queryable, path: string, request: Request | undefined): Promise<void> {
  if (!request || path === "/get-session") return;
  const rows = await q.query<{ org_id: string; provider_id: string; domain: string }>("SELECT org_id, provider_id, domain FROM sso_providers WHERE sso_required AND domain_verified");
  latest = rows.flatMap((r) => r.domain.toLowerCase().split(",").map((d) => ({ orgId: r.org_id, providerId: r.provider_id, domain: d.trim() })));
  requiredOf.set(request, latest);
}

type Resolution = { action: "continue" } | { action: "link"; userId: string; profile: "preserve" };

/** SSO at a required domain: an account whose email was never confirmed is linked; its unproven password and passkeys end (owners keep theirs). */
export async function linkAtRequiredDomain(providerId: string, email: string, db: DBTransactionAdapter): Promise<Resolution> {
  const at = email.trim().toLowerCase();
  const r = latest.find((x) => x.providerId === providerId && x.domain === at.split("@")[1]);
  const user = r ? await db.findOne<{ id: string; emailVerified: boolean }>({ model: "user", where: [{ field: "email", value: at }] }) : null;
  if (!r || !user || user.emailVerified) return { action: "continue" };
  const mine = (field: string, value: string) => [{ field: "userId", value: user.id }, { field, value }];
  if (await db.findOne({ model: "account", where: mine("providerId", providerId) })) return { action: "continue" };
  const roles = await db.findMany<{ role: string }>({ model: "member", where: mine("organizationId", r.orgId) });
  if (!roles.some((m) => m.role === "owner")) {
    await db.deleteMany({ model: "account", where: mine("providerId", "credential") });
    await db.deleteMany({ model: "passkey", where: [{ field: "userId", value: user.id }] });
  }
  await db.update({ model: "user", where: [{ field: "id", value: user.id }], update: { emailVerified: true } });
  return { action: "link", userId: user.id, profile: "preserve" };
}

/** Better Auth's view of the request a session hook runs in. */
export interface HookCtx {
  path?: string;
  request?: Request;
  context: {
    internalAdapter: { findUserById(id: string): Promise<{ email: string } | null> };
    adapter: { findMany<T>(a: { model: string; where: { field: string; value: string }[] }): Promise<T[]> };
  };
}

/** Before any new session (passkey, two-step, a verified email): one made outside the provider's routes is refused too. */
export async function guardSession(userId: string, ctx: HookCtx | null): Promise<void> {
  const list = ctx?.request && !ctx.path?.startsWith("/sso/") ? requiredOf.get(ctx.request) : undefined;
  if (!ctx || !list?.length) return;
  const email = (await ctx.context.internalAdapter.findUserById(userId))?.email ?? "";
  const r = list.find((x) => x.domain === email.toLowerCase().split("@")[1]);
  if (!r) return;
  const roles = await ctx.context.adapter.findMany<{ role: string }>({ model: "member", where: [{ field: "userId", value: userId }, { field: "organizationId", value: r.orgId }] });
  if (!roles.some((m) => m.role === "owner")) throw refuse(r);
}

/** Sign out everyone at the domain except the organization's owners, so the next sign-in goes through the provider. */
export async function endPasswordSessions(q: Queryable, orgId: string, domain: string): Promise<number> {
  const domains = domain.toLowerCase().split(",").map((d) => d.trim()).filter(Boolean);
  const rows = await q.query(
    `DELETE FROM sessions s USING users u WHERE u.id = s.user_id AND split_part(lower(u.email), '@', 2) = ANY ($2)
     AND NOT EXISTS (SELECT 1 FROM members m WHERE m.org_id = $1 AND m.user_id = u.id AND m.role = 'owner') RETURNING s.id`,
    [orgId, domains],
  );
  return rows.length;
}
