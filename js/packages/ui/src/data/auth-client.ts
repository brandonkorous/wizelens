import { passkeyClient } from "@better-auth/passkey/client";
import { ssoClient } from "@better-auth/sso/client";
import { createAuthClient } from "better-auth/client";
import { organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { ACCESS_STATEMENTS, ORG_ROLES, type OrgRole, ROLE_GRANTS } from "@wizeworks/lens-core";
import { hrefTo, navigate } from "../routes";

// Loaded only on cloud hosts (dynamic import from data/account.ts), so in-app and hub dashboards never ship it.
const ac = createAccessControl(ACCESS_STATEMENTS);
const roles = Object.fromEntries(ORG_ROLES.map((r) => [r, ac.newRole(ROLE_GRANTS[r] as Parameters<typeof ac.newRole>[0])])) as Record<OrgRole, ReturnType<typeof ac.newRole>>;

/** Better Auth below `api/auth/`, next to this dashboard. Changes carry the dashboard header the cloud checks. */
export const authClient = createAuthClient({
  baseURL: new URL("api/auth", window.location.origin + window.location.pathname).toString(),
  fetchOptions: { credentials: "same-origin", headers: { "X-WizeLens-Client": "dashboard" } },
  plugins: [organizationClient({ ac, roles }), twoFactorClient({ onTwoFactorRedirect: () => navigate(hrefTo("two-factor")) }), passkeyClient(), ssoClient({ domainVerification: { enabled: true } })],
});

export type AuthClient = typeof authClient;

/** Better Auth's own address, for the URLs an identity provider needs (callback, ACS, metadata). */
export const authBase = (): string => new URL("api/auth", window.location.origin + window.location.pathname).toString();
