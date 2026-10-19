import { passkey } from "@better-auth/passkey";
import type { BetterAuthPlugin } from "better-auth";
import { haveIBeenPwned, organization, twoFactor } from "better-auth/plugins";
import { inviteMail } from "../mail/templates.js";
import { oauthPlugin } from "./oauth.js";
import { grantPlugin } from "./oauth-grant.js";
import { type AuthDeps, appLink } from "./deps.js";
import { ac, authRoles } from "./roles.js";
import { orgSchema, passkeySchema, twoFactorSchema } from "./schema-names.js";
import { stripePlugin } from "../billing/stripe-plugin.js";
import { scimPlugin } from "./scim.js";
import { ssoPlugin } from "./sso.js";

const DAY = 24 * 60 * 60;

/** Only the cloud creates organizations and only our route deletes one; an invite opens only for its (verified, with mail) email. */
function orgPlugin(deps: AuthDeps): BetterAuthPlugin {
  return organization({
    ac,
    roles: authRoles,
    creatorRole: "owner",
    allowUserToCreateOrganization: false,
    organizationLimit: 50,
    membershipLimit: 1000,
    invitationExpiresIn: 7 * DAY,
    invitationLimit: 500,
    cancelPendingInvitationsOnReInvite: true,
    requireEmailVerificationOnInvitation: deps.mailer.live,
    disableOrganizationDeletion: true,
    schema: orgSchema,
    sendInvitationEmail: async ({ id, email, role, organization: org, inviter }) => deps.mailer.send(inviteMail(email, inviter.user.name, org.name, String(role), appLink(deps, "invite", id))),
  });
}

/** Codes from a phone app, with 10 one-time backup codes. Both are stored encrypted with the auth secret. */
function twoFactorPlugin(): BetterAuthPlugin {
  return twoFactor({
    issuer: "WizeLens",
    schema: twoFactorSchema,
    totpOptions: { digits: 6, period: 30 },
    backupCodeOptions: { amount: 10, length: 12, storeBackupCodes: "encrypted" },
    trustDeviceMaxAge: 14 * DAY,
    twoFactorCookieMaxAge: 5 * 60,
    accountLockout: { enabled: true, maxFailedAttempts: 10, durationSeconds: 15 * 60 },
  });
}

/** Passkeys must check the person on the device (PIN, fingerprint), so a passkey is two factors by itself. */
function passkeyPlugin(deps: AuthDeps): BetterAuthPlugin {
  const url = new URL(deps.publicUrl);
  return passkey({ rpID: url.hostname, rpName: "WizeLens", origin: deps.trustedOrigins, schema: passkeySchema, authenticatorSelection: { residentKey: "preferred", userVerification: "required" } });
}

export const authPlugins = (deps: AuthDeps): BetterAuthPlugin[] => [
  orgPlugin(deps),
  twoFactorPlugin(),
  passkeyPlugin(deps),
  ssoPlugin(deps),
  oauthPlugin(deps),
  grantPlugin(deps.db),
  scimPlugin(deps),
  ...(deps.stripe ? [stripePlugin(deps, deps.stripe)] : []),
  ...(deps.checkPwned ? [haveIBeenPwned()] : []),
];
