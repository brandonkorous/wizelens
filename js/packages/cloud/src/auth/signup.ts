import { timingSafeEqual } from "node:crypto";
import { type BetterAuthOptions, getCurrentAdapter } from "better-auth";
import type { AuthDeps } from "./deps.js";
import { ssoProviderOf, ssoTrusts } from "./sso.js";

type UserOptions = NonNullable<BetterAuthOptions["user"]>;
type Validate = NonNullable<UserOptions["validateUserInfo"]>;
type Ctx = Parameters<Validate>[1];

export const SETUP_HEADER = "x-wizelens-setup-token";
export const INVITE_HEADER = "x-wizelens-invite";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

interface InviteRow {
  id: string;
  expiresAt: Date;
}

/** An open invite for this email (read through Better Auth's adapter, inside its transaction); without real mail, its id too. */
async function invitedNow(deps: AuthDeps, ctx: Ctx, email: string): Promise<boolean> {
  const db = await getCurrentAdapter(ctx.context.adapter);
  const rows = await db.findMany<InviteRow>({ model: "invitation", where: [{ field: "email", value: email.toLowerCase() }, { field: "status", value: "pending" }] });
  const open = rows.filter((r) => new Date(r.expiresAt).getTime() > Date.now());
  if (deps.mailer.live) return open.length > 0;
  const id = ctx.headers?.get(INVITE_HEADER) ?? "";
  return open.some((r) => same(r.id, id));
}

/** Who may make an account: by SSO, only from a proven domain; the first needs the setup token; then the invited, or anyone with open sign-up. */
export function signupGate(deps: AuthDeps): Validate {
  return async ({ user, source }, ctx) => {
    if (source.action !== "create-user") return;
    const db = await getCurrentAdapter(ctx.context.adapter);
    const viaSso = ssoProviderOf(source);
    if (viaSso) return (await ssoTrusts(db, viaSso, String(user.email ?? ""))) ? undefined : { error: "sso_domain", errorDescription: "Single sign-on works only for emails at the provider's verified domain." };
    if ((await db.count({ model: "user" })) === 0) {
      const want = deps.setup.token();
      if (want && same(ctx.headers?.get(SETUP_HEADER) ?? "", want)) return;
      return { error: "setup_token", errorDescription: "The first account needs the setup link printed when the cloud started." };
    }
    if (deps.signup === "open" || (await invitedNow(deps, ctx, String(user.email ?? "")))) return;
    return { error: "signup_closed", errorDescription: "Sign-up needs an invite. Ask your team for one." };
  };
}

/** A new account from single sign-on: the provider's organization takes it in. */
const bySso = (ctx: unknown) => String((ctx as { path?: unknown } | null)?.path ?? "").startsWith("/sso/");

/** The provider proved the domain and the gate checked the email, so an SSO account starts confirmed. */
export async function confirmSsoEmail<U extends { email: string; emailVerified?: boolean }>(user: U, ctx: unknown): Promise<{ data: U } | undefined> {
  const providerId = (ctx as { params?: { providerId?: unknown } } | null)?.params?.providerId;
  if (!bySso(ctx) || typeof providerId !== "string") return undefined;
  const db = await getCurrentAdapter((ctx as { context: { adapter: Parameters<typeof getCurrentAdapter>[0] } }).context.adapter);
  return (await ssoTrusts(db, providerId, user.email)) ? { data: { ...user, emailVerified: true } } : undefined;
}

/** Runs after the new user is saved: the first account and open sign-ups get their own organization and project. */
export function afterSignup(deps: AuthDeps, createOrg: (userId: string, name: string) => Promise<unknown>) {
  return async (user: { id: string; name: string; email: string }, ctx: unknown): Promise<void> => {
    if (!ctx || bySso(ctx)) return;
    const [count] = await deps.db.query<{ n: number }>("SELECT count(*)::int AS n FROM users");
    const [pending] = await deps.db.query<{ invited: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM invites WHERE email = $1 AND status = 'pending' AND expires_at > now()) AS invited",
      [user.email.toLowerCase()],
    );
    const first = count?.n === 1;
    if (first) deps.setup.done();
    if (first || (deps.signup === "open" && !pending?.invited)) await createOrg(user.id, `${user.name.trim()}'s team`);
  };
}
