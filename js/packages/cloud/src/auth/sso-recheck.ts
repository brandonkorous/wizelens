// A person the identity provider turned off loses WizeLens within minutes: the cloud renews each OIDC sign-in, and a refusal ends it.
import { decryptOAuthToken, setTokenUtil } from "better-auth/oauth2";
import type { CloudApp } from "../app.js";
import { audit } from "../repo/audit.js";
import { endGrant } from "../repo/grants.js";

type AuthCtx = Parameters<typeof decryptOAuthToken>[1];

interface Row {
  id: string;
  user_id: string;
  provider_id: string;
  refresh_token: string;
  oidc_config: string;
  org_id: string | null;
}

interface OidcConfig {
  clientId?: string;
  clientSecret?: string;
  tokenEndpoint?: string;
  tokenEndpointAuthentication?: string;
}

/** "ok" with the new refresh token if any, "refused" when the provider says the sign-in is over, "unknown" when it could not be asked. */
export type Verdict = { verdict: "ok"; refresh?: string } | { verdict: "refused" | "unknown" };

/** People with a live session and a refresh token from an OIDC provider of an organization. */
async function signedInViaOidc(app: CloudApp): Promise<Row[]> {
  return app.db.query<Row>(
    `SELECT a.id, a.user_id, a.provider_id, a.refresh_token, p.oidc_config, p.org_id FROM accounts a JOIN sso_providers p ON p.provider_id = a.provider_id
     WHERE a.refresh_token IS NOT NULL AND a.refresh_token <> '' AND p.oidc_config IS NOT NULL
       AND EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = a.user_id AND s.expires_at > now())`,
  );
}

/** The token request: client_secret_post puts the client in the body, client_secret_basic (the default) in the header. */
function tokenRequest(cfg: OidcConfig, refresh: string): RequestInit {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (cfg.tokenEndpointAuthentication === "client_secret_post") (body.set("client_id", cfg.clientId!), body.set("client_secret", cfg.clientSecret ?? ""));
  else headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(cfg.clientId!)}:${encodeURIComponent(cfg.clientSecret ?? "")}`).toString("base64")}`;
  return { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) };
}

/** Ask the provider to renew one sign-in. Only `invalid_grant` counts as refused: a provider that is down signs nobody out. */
export async function renew(fetchFn: typeof fetch, origins: readonly string[], cfg: OidcConfig, refresh: string): Promise<Verdict> {
  const at = cfg.tokenEndpoint && URL.canParse(cfg.tokenEndpoint) ? new URL(cfg.tokenEndpoint) : null;
  if (!at || !origins.includes(at.origin) || !cfg.clientId || cfg.tokenEndpointAuthentication === "private_key_jwt") return { verdict: "unknown" };
  try {
    const res = await fetchFn(at.href, tokenRequest(cfg, refresh));
    const json = (await res.json().catch(() => ({}))) as { error?: unknown; refresh_token?: unknown };
    if (res.ok) return { verdict: "ok", refresh: typeof json.refresh_token === "string" ? json.refresh_token : undefined };
    return { verdict: res.status === 400 && json.error === "invalid_grant" ? "refused" : "unknown" };
  } catch {
    return { verdict: "unknown" };
  }
}

/** The provider refused: end every session, the connected apps in its organization, and the stored tokens, and say so in the audit log. */
async function signOut(app: CloudApp, row: Row): Promise<void> {
  const now = app.config.now();
  const ended = await app.db.query<{ id: string }>("DELETE FROM sessions WHERE user_id = $1 RETURNING id", [row.user_id]);
  await app.db.query("UPDATE accounts SET refresh_token = NULL, access_token = NULL, id_token = NULL WHERE id = $1", [row.id]);
  if (!row.org_id) return;
  const grants = await app.db.query<{ id: string }>("SELECT id FROM oauth_grants WHERE user_id = $1 AND org_id = $2 AND revoked_ms IS NULL", [row.user_id, row.org_id]);
  for (const g of grants) await endGrant(app.db, g.id, now);
  await audit(app.db, row.org_id, "system", "sso.signed_out", { userId: row.user_id, providerId: row.provider_id, sessions: ended.length, connectedApps: grants.length }, now);
}

/** Renew every OIDC sign-in that has a live session; sign out the people their provider refused. Returns how many were signed out. */
export async function recheckSso(app: CloudApp): Promise<number> {
  const rows = await signedInViaOidc(app);
  if (rows.length === 0) return 0;
  const ctx = (await (app.auth as unknown as { $context: Promise<AuthCtx> }).$context) as AuthCtx;
  let out = 0;
  for (const row of rows) {
    const cfg = JSON.parse(row.oidc_config) as OidcConfig;
    const result = await renew(app.config.fetch, app.config.ssoOrigins, cfg, await decryptOAuthToken(row.refresh_token, ctx));
    if (result.verdict === "refused") (await signOut(app, row), out++);
    else if (result.verdict === "ok" && result.refresh) await app.db.query("UPDATE accounts SET refresh_token = $1 WHERE id = $2", [await setTokenUtil(result.refresh, ctx), row.id]);
  }
  return out;
}
