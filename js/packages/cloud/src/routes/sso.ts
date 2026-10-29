import type { Ctx } from "../app.js";
import { requireOrg } from "../auth/principal.js";
import { endPasswordSessions } from "../auth/sso-required.js";
import { requireFeature } from "../billing/gate.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";

// "Require single sign-on" per provider, for owners and admins. Better Auth's SSO plugin holds the rest of the provider.

interface Row {
  provider_id: string;
  domain: string;
  domain_verified: boolean | null;
  sso_required: boolean;
}

const providersOf = (ctx: Ctx) =>
  ctx.app.db.query<Row>("SELECT provider_id, domain, domain_verified, sso_required FROM sso_providers WHERE org_id = $1 ORDER BY provider_id", [ctx.params.org!]);

async function list(ctx: Ctx): Promise<void> {
  await requireOrg(ctx, ctx.params.org!, "manage");
  sendJson(ctx.res, 200, (await providersOf(ctx)).map((p) => ({ providerId: p.provider_id, required: p.sso_required })));
}

async function setRequired(ctx: Ctx): Promise<void> {
  const { user } = await requireOrg(ctx, ctx.params.org!, "manage");
  const body = (await readJsonBody(ctx.req)) as { required?: unknown };
  if (typeof body.required !== "boolean") return fail(400, "Send required: true or false.");
  const p = (await providersOf(ctx)).find((x) => x.provider_id === ctx.params.provider);
  if (!p) return fail(404, "Provider not found.");
  if (body.required) await requireFeature(ctx.app, ctx.params.org!, "sso");
  if (body.required && p.domain_verified !== true) return fail(409, `Prove ${p.domain} first: until then nobody can sign in with this provider.`);
  await ctx.app.db.query("UPDATE sso_providers SET sso_required = $2 WHERE provider_id = $1", [p.provider_id, body.required]);
  const signedOut = body.required ? await endPasswordSessions(ctx.app.db, ctx.params.org!, p.domain) : 0;
  await audit(ctx.app.db, ctx.params.org!, `user:${user.id}`, "sso.require", { providerId: p.provider_id, domain: p.domain, required: body.required, signedOut }, ctx.app.config.now());
  sendJson(ctx.res, 200, { providerId: p.provider_id, required: body.required, signedOut });
}

interface PersonRow {
  name: string;
  email: string;
  provider_id: string;
  oidc: boolean;
  signed_in: boolean;
  checked_ms: number | null;
  verdict: string | null;
}

/** Everyone who signs in through this organization's providers: signed in now, and the last check with the provider (OpenID Connect only). */
async function people(ctx: Ctx): Promise<void> {
  await requireOrg(ctx, ctx.params.org!, "manage");
  const rows = await ctx.app.db.query<PersonRow>(
    `SELECT u.name, u.email, a.provider_id, p.oidc_config IS NOT NULL AS oidc, c.checked_ms, c.verdict,
       EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = a.user_id AND s.expires_at > now()) AS signed_in
     FROM accounts a JOIN sso_providers p ON p.provider_id = a.provider_id JOIN users u ON u.id = a.user_id
     LEFT JOIN sso_checks c ON c.account_id = a.id WHERE p.org_id = $1 ORDER BY lower(u.name), u.email`,
    [ctx.params.org!],
  );
  const out = rows.map((r) => ({ name: r.name, email: r.email, providerId: r.provider_id, oidc: r.oidc, signedIn: r.signed_in, checkedMs: r.checked_ms, verdict: r.verdict }));
  sendJson(ctx.res, 200, out);
}

export function ssoRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/orgs/:org/sso", list).on("GET", "api/orgs/:org/sso/people", people).on("PATCH", "api/orgs/:org/sso/:provider", setRequired);
}
