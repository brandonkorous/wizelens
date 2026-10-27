import { passkeyClient } from "@better-auth/passkey/client";
import { ssoClient } from "@better-auth/sso/client";
import { createAuthClient } from "better-auth/client";
import { organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { ACCESS_STATEMENTS, ORG_ROLES, type OrgRole, ROLE_GRANTS } from "@wizeworks/lens-core";
import { toTwoFactor } from "../routes";
import { pendingOAuth } from "./oauth";

// Loaded only on cloud hosts (dynamic import from data/account.ts), so in-app and hub dashboards never ship it.
const ac = createAccessControl(ACCESS_STATEMENTS);
const roles = Object.fromEntries(ORG_ROLES.map((r) => [r, ac.newRole(ROLE_GRANTS[r] as Parameters<typeof ac.newRole>[0])])) as Record<OrgRole, ReturnType<typeof ac.newRole>>;

/** Calls that sign in or answer the consent page carry the app's signed query, so Better Auth goes on with the authorization. */
const OAUTH_CALLS = /\/(sign-in\/|sign-up\/|two-factor\/verify|passkey\/verify-authentication|oauth2\/(consent|continue)|wizelens\/oauth-grant)/;

/** Like Better Auth's own OAuth client plugin, but the query rides in the hash route, so it never reaches a server log. */
const oauthQuery = {
  id: "wizelens-oauth-query",
  $InferServerPlugin: {},
  fetchPlugins: [
    {
      id: "wizelens-oauth-query",
      name: "wizelens-oauth-query",
      hooks: {
        async onRequest(ctx: { url: string | URL; method?: string; body?: unknown }) {
          const query = pendingOAuth.get();
          if (!query || ctx.method === "GET" || !OAUTH_CALLS.test(String(ctx.url))) return;
          const body = (typeof ctx.body === "string" ? JSON.parse(ctx.body || "{}") : (ctx.body ?? {})) as Record<string, unknown>;
          if (!body.oauth_query) ctx.body = JSON.stringify({ ...body, oauth_query: query });
        },
      },
    },
  ],
};

/** Better Auth below `api/auth/`, next to this dashboard. Changes carry the dashboard header the cloud checks. */
export const authClient = createAuthClient({
  baseURL: new URL("api/auth", window.location.origin + window.location.pathname).toString(),
  fetchOptions: { credentials: "same-origin", headers: { "X-WizeLens-Client": "dashboard" } },
  plugins: [organizationClient({ ac, roles }), twoFactorClient({ onTwoFactorRedirect: toTwoFactor }), passkeyClient(), ssoClient({ domainVerification: { enabled: true } }), oauthQuery],
});

export type AuthClient = typeof authClient;

/** Better Auth's own address, for the URLs an identity provider needs (callback, ACS, metadata). */
export const authBase = (): string => new URL("api/auth", window.location.origin + window.location.pathname).toString();
