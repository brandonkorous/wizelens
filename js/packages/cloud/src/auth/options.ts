import { randomUUID } from "node:crypto";
import type { BetterAuthOptions } from "better-auth";
import { passwordChanged } from "../mail/emails-security.js";
import { unsuppress } from "../repo/suppressions.js";
import { sendSecurity } from "./security-notices.js";
import { changeEmailMail, deleteAccountMail, resetPasswordMail, verifyEmailMail } from "../mail/templates.js";
import { type AuthDeps, appLink } from "./deps.js";
import { passwordOptions } from "./password.js";
import { accountNames, rateLimitNames, sessionNames, userNames, verificationNames } from "./schema-names.js";
import { signupGate } from "./signup.js";

export const AUTH_BASE_PATH = "/_wizelens/api/auth";
export const CLIENT_IP_HEADER = "x-wizelens-client-ip";
const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;

/** Who the person is and how they leave: change email, delete the account. Deleting checks organizations first (auth/delete-user.ts). */
export function userOptions(deps: AuthDeps, beforeDelete: (user: { id: string }) => Promise<void>): BetterAuthOptions["user"] {
  return {
    ...userNames,
    validateUserInfo: signupGate(deps),
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, token }) => deps.mailer.send(changeEmailMail(user.email, newEmail, appLink(deps, "verify-email", token))),
    },
    deleteUser: {
      enabled: true,
      ...(deps.mailer.live ? { sendDeleteAccountVerification: async ({ user, token }) => deps.mailer.send(deleteAccountMail(user.email, appLink(deps, "delete-account", token))) } : {}),
      beforeDelete,
    },
  };
}

/** Email and password, with links that open the dashboard. Without real mail there is nothing to verify with, so it is not asked for. */
export function passwordAuth(deps: AuthDeps): Pick<BetterAuthOptions, "emailAndPassword" | "emailVerification"> {
  return {
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: deps.mailer.live,
      autoSignIn: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 30 * MINUTE,
      revokeSessionsOnPasswordReset: true,
      password: passwordOptions,
      sendResetPassword: async ({ user, token }) => deps.mailer.send(resetPasswordMail(user.email, appLink(deps, "reset-password", token))),
      onPasswordReset: async ({ user }) => sendSecurity(deps, user.id, (l) => passwordChanged(l, Date.now()), user.email),
      customSyntheticUser: ({ coreFields, additionalFields, id }) => ({ ...coreFields, twoFactorEnabled: false, ...additionalFields, id }),
    },
    emailVerification: {
      sendOnSignUp: deps.mailer.live,
      autoSignInAfterVerification: true,
      expiresIn: 60 * MINUTE,
      sendVerificationEmail: async ({ user, token }) => deps.mailer.send(verifyEmailMail(user.email, appLink(deps, "verify-email", token))),
      afterEmailVerification: async (user) => unsuppress(deps.db, user.email),
    },
  };
}

/** Sessions live in the database only (no cookie cache), so signing out a device or a password reset works on the next request. */
export function sessionOptions(): Pick<BetterAuthOptions, "session" | "account" | "verification"> {
  return {
    session: { ...sessionNames, expiresIn: 14 * DAY, updateAge: DAY, freshAge: 15 * MINUTE, cookieCache: { enabled: false } },
    account: { ...accountNames, encryptOAuthTokens: true },
    verification: { ...verificationNames, storeIdentifier: "hashed" },
  };
}

/** Limits per client address, shared by every instance through the database. */
export function rateLimitOptions(): BetterAuthOptions["rateLimit"] {
  return {
    enabled: true,
    storage: "database",
    ...rateLimitNames,
    window: 60,
    max: 120,
    customRules: {
      "/sign-in/*": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/two-factor/*": { window: 60, max: 10 },
      "/request-password-reset": { window: 5 * MINUTE, max: 3 },
      "/send-verification-email": { window: 5 * MINUTE, max: 3 },
      "/change-password": { window: 60, max: 5 },
      "/change-email": { window: 5 * MINUTE, max: 3 },
      "/delete-user": { window: 5 * MINUTE, max: 5 },
      "/get-session": { window: 10, max: 60 },
      "/sso/register": { window: 60, max: 5 },
      "/sso/verify-domain": { window: 60, max: 5 },
      // An identity provider's first sync sends a call per person; tokens are checked on every call.
      "/scim/v2/*": { window: 60, max: 1200 },
    },
  };
}

/** Every safety switch set on purpose: Better Auth relaxes some in test and development runs. */
export function advancedOptions(deps: AuthDeps): BetterAuthOptions["advanced"] {
  return {
    cookiePrefix: "wizelens",
    useSecureCookies: deps.publicUrl.startsWith("https://"),
    defaultCookieAttributes: { sameSite: "lax", path: "/_wizelens" },
    disableCSRFCheck: false,
    disableOriginCheck: false,
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    database: { generateId: () => randomUUID(), validateSchema: true },
  };
}
