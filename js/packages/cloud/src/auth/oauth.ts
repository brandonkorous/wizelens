import { oauthProvider } from "@better-auth/oauth-provider";
import type { BetterAuthPlugin } from "better-auth";
import { pendingGrantId } from "../repo/grants.js";
import type { AuthDeps } from "./deps.js";
import { oauthSchema } from "./oauth-names.js";

/** The one permission a connected app can get: read, like a read key. */
export const MCP_SCOPE = "wizelens:read";
/** Refresh tokens, so a scheduled agent keeps working after the first hour. Always added (auth/oauth-grant.ts). */
export const OFFLINE_SCOPE = "offline_access";
export const OAUTH_SCOPES = [MCP_SCOPE, OFFLINE_SCOPE];
/** The access token claim that names the grant (repo/grants.ts) behind it. */
export const GRANT_CLAIM = "wl_grant";
/** The dashboard pages Better Auth sends people to. The signed query rides in the hash, so it never reaches a server log. */
export const OAUTH_LOGIN_PAGE = "/_wizelens/#/oauth";
export const OAUTH_CONSENT_PAGE = "/_wizelens/#/oauth-consent";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/** Every address an agent may name as the MCP resource: the cloud's own path, and the MCP origin (bare, with `/`, with `/mcp`). */
export function mcpResources(publicUrl: string, mcpUrl: string | undefined): string[] {
  const own = `${publicUrl}/_wizelens/mcp`;
  return mcpUrl ? [own, mcpUrl, `${mcpUrl}/`, `${mcpUrl}/mcp`] : [own];
}

/** OAuth 2.1 for MCP clients: open dynamic registration, PKCE, opaque tokens, one read scope, and consent tied to a grant. */
export function oauthPlugin(deps: AuthDeps): BetterAuthPlugin {
  const resources = mcpResources(deps.publicUrl, deps.mcpUrl);
  return oauthProvider({
    schema: oauthSchema,
    scopes: OAUTH_SCOPES,
    loginPage: OAUTH_LOGIN_PAGE,
    consentPage: OAUTH_CONSENT_PAGE,
    disableJwtPlugin: true,
    grantTypes: ["authorization_code", "refresh_token"],
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    clientRegistrationDefaultApplicationType: "infer",
    clientRegistrationDefaultResources: resources,
    resources: resources.map((identifier) => ({ identifier, name: "WizeLens MCP", allowedScopes: OAUTH_SCOPES })),
    resourceSeedMode: "merge",
    accessTokenExpiresIn: HOUR,
    refreshTokenExpiresIn: 30 * DAY,
    clientPrivileges: () => false,
    postLogin: { page: OAUTH_CONSENT_PAGE, shouldRedirect: () => false, consentReferenceId: ({ session }) => pendingGrantId(deps.db, session.id, Date.now()) },
    customAccessTokenClaims: ({ referenceId }) => (referenceId ? { [GRANT_CLAIM]: referenceId } : {}),
    prefix: { opaqueAccessToken: "wl_at_", refreshToken: "wl_rt_" },
    // Claude and other hosted agents share a few addresses, so the token and register limits are per many people.
    rateLimit: { token: { window: 60, max: 600 }, register: { window: 60, max: 60 }, authorize: { window: 60, max: 60 } },
  }) as unknown as BetterAuthPlugin;
}
