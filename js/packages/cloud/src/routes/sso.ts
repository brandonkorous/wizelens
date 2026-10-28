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

export function ssoRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/orgs/:org/sso", list).on("PATCH", "api/orgs/:org/sso/:provider", setRequired);
}
