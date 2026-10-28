import { getSessionFromCtx } from "better-auth/api";
import type { BetterAuthOptions } from "better-auth";
import type { EmailContent } from "../mail/content.js";
import * as security from "../mail/emails-security.js";
import { renderMail } from "../mail/templates.js";
import type { AuthDeps } from "./deps.js";
import { changeOf } from "./email-token.js";

type DbHooks = NonNullable<BetterAuthOptions["databaseHooks"]>;
type HookCtx = Parameters<NonNullable<NonNullable<DbHooks["user"]>["update"]>["after"] & {}>[1];

const BROWSERS: [RegExp, string][] = [[/Edg\//, "Edge"], [/OPR\//, "Opera"], [/Firefox\//, "Firefox"], [/Chrome\//, "Chrome"], [/Safari\//, "Safari"]];
const SYSTEMS: [RegExp, string][] = [[/iPhone|iPad/, "iOS"], [/Android/, "Android"], [/Windows/, "Windows"], [/Mac OS X|Macintosh/, "macOS"], [/CrOS/, "ChromeOS"], [/Linux/, "Linux"]];

/** "Chrome on Windows". Versions are left out, so a browser update is not a new device. */
export function deviceOf(ua: string | null | undefined): string {
  const browser = BROWSERS.find(([r]) => r.test(ua ?? ""))?.[1];
  const system = SYSTEMS.find(([r]) => r.test(ua ?? ""))?.[1];
  return browser && system ? `${browser} on ${system}` : browser || system || "an unknown device";
}

export const linksOf = (deps: Pick<AuthDeps, "publicUrl">): security.SecurityLinks => ({
  account: `${deps.publicUrl}/_wizelens/#/account`,
  forgot: `${deps.publicUrl}/_wizelens/#/forgot-password`,
});

/** One security notice to the person's address now. */
export async function sendSecurity(deps: AuthDeps, userId: string, content: (l: security.SecurityLinks) => EmailContent, to?: string): Promise<void> {
  const [u] = await deps.db.query<{ email: string; time_zone: string | null }>("SELECT u.email, p.time_zone FROM users u LEFT JOIN mail_prefs p ON p.user_id = u.id WHERE u.id = $1", [userId]);
  const email = to ?? u?.email;
  if (email) deps.mailer.send(renderMail(email, content({ ...linksOf(deps), timeZone: u?.time_zone ?? undefined })));
}

/** A sign-in on a browser and system this person never used gets a notice. The first device (sign-up) does not. */
async function onSession(deps: AuthDeps, s: { userId: string; userAgent?: string | null; ipAddress?: string | null }): Promise<void> {
  const device = deviceOf(s.userAgent);
  const now = Date.now();
  const fresh = await deps.db.query("INSERT INTO known_devices (user_id, device, first_ms, last_ms) VALUES ($1, $2, $3, $3) ON CONFLICT DO NOTHING RETURNING device", [s.userId, device, now]);
  if (fresh.length === 0) return void (await deps.db.query("UPDATE known_devices SET last_ms = $3 WHERE user_id = $1 AND device = $2", [s.userId, device, now]));
  const [n] = await deps.db.query<{ n: number }>("SELECT count(*)::int AS n FROM known_devices WHERE user_id = $1", [s.userId]);
  if ((n?.n ?? 0) > 1) await sendSecurity(deps, s.userId, (l) => security.newSignIn(l, device, s.ipAddress ?? "", now));
}

/** What a user update is about to change, kept until it is saved. */
const pending = new WeakMap<object, Record<string, unknown>>();

async function onUserUpdated(deps: AuthDeps, user: { id: string; email: string }, ctx: HookCtx): Promise<void> {
  const change = ctx ? pending.get(ctx) : undefined;
  if (!change) return;
  const now = Date.now();
  if (typeof change.twoFactorEnabled === "boolean") await sendSecurity(deps, user.id, (l) => security.twoFactorChanged(l, change.twoFactorEnabled as boolean, now));
  const moved = changeOf((ctx?.query as Record<string, unknown> | undefined)?.token);
  if (typeof change.email === "string" && moved && moved.from !== user.email) await sendSecurity(deps, user.id, (l) => security.emailChanged(l, user.email, now), moved.from);
}

/** Database hooks for sessions and user changes: new devices, two-step sign-in on or off, and a changed email. */
export function securityDbHooks(deps: AuthDeps): Pick<DbHooks, "session" | "user"> {
  return {
    session: { create: { after: async (s) => onSession(deps, s) } },
    user: {
      update: {
        before: async (data, ctx) => void (ctx && pending.set(ctx, data)),
        after: async (user, ctx) => onUserUpdated(deps, user, ctx),
      },
    },
  };
}

const PASSKEY_NAMES = new WeakMap<object, string>();

/** Before a passkey goes, keep its name for the notice. */
export async function rememberPasskey(ctx: { request?: Request; body?: unknown; context: { adapter: { findOne<T>(a: unknown): Promise<T | null> } } }): Promise<void> {
  const id = (ctx.body as { id?: unknown } | undefined)?.id;
  if (!ctx.request || typeof id !== "string") return;
  const row = await ctx.context.adapter.findOne<{ name?: string | null }>({ model: "passkey", where: [{ field: "id", value: id }] });
  PASSKEY_NAMES.set(ctx.request, row?.name ?? "");
}

type AfterCtx = Parameters<typeof getSessionFromCtx>[0] & { path: string; request?: Request; context: { returned?: unknown } };

/** Notices from endpoints: a changed password, a passkey added or removed, new backup codes. */
export async function securityAfter(deps: AuthDeps, ctx: AfterCtx): Promise<void> {
  const notices: Record<string, (l: security.SecurityLinks, now: number) => EmailContent> = {
    "/change-password": (l, now) => security.passwordChanged(l, now),
    "/passkey/verify-registration": (l, now) => security.passkeyChanged(l, true, (ctx.context.returned as { name?: string } | undefined)?.name ?? "", now),
    "/passkey/delete-passkey": (l, now) => security.passkeyChanged(l, false, (ctx.request && PASSKEY_NAMES.get(ctx.request)) ?? "", now),
    "/two-factor/generate-backup-codes": (l, now) => security.backupCodesMade(l, now),
  };
  const make = notices[ctx.path];
  const user = make && (await getSessionFromCtx(ctx))?.user;
  if (make && user) await sendSecurity(deps, user.id, (l) => make(l, Date.now()));
}
