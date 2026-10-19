import type { Ctx } from "../app.js";
import { AUTH_BASE_PATH } from "../auth/options.js";
import { requireOrg } from "../auth/principal.js";
import { planRequired, requireFeature } from "../billing/gate.js";
import { fail, readJsonBody, sendJson, str } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { orgHas } from "../repo/billing.js";
import { createScimToken, listScimTokens, revokeScimToken } from "../repo/scim-tokens.js";

// SCIM provisioning for owners and admins: the base URL the identity provider calls, and its bearer tokens (auth/scim.ts).

async function overview(ctx: Ctx): Promise<void> {
  await requireOrg(ctx, ctx.params.org!, "manage");
  const allowed = await orgHas(ctx.app.db, ctx.params.org!, ctx.app.billing.on, "scim");
  sendJson(ctx.res, 200, {
    allowed,
    ...(allowed ? {} : { plan: planRequired("scim").plan }),
    baseUrl: `${ctx.app.baseUrl()}${AUTH_BASE_PATH}/scim/v2`,
    tokens: await listScimTokens(ctx.app.db, ctx.params.org!),
  });
}

async function newToken(ctx: Ctx): Promise<void> {
  const { user } = await requireOrg(ctx, ctx.params.org!, "manage");
  await requireFeature(ctx.app, ctx.params.org!, "scim");
  const name = str(await readJsonBody(ctx.req), "name", false);
  const made = await createScimToken(ctx.app.db, ctx.params.org!, name, user.id, ctx.app.config.now());
  await audit(ctx.app.db, ctx.params.org!, `user:${user.id}`, "scim.token.create", { name: made.item.name, tokenId: made.item.id }, ctx.app.config.now());
  sendJson(ctx.res, 201, made);
}

async function revoke(ctx: Ctx): Promise<void> {
  const { user } = await requireOrg(ctx, ctx.params.org!, "manage");
  if (!(await revokeScimToken(ctx.app.db, ctx.params.org!, ctx.params.id!, ctx.app.config.now()))) return fail(404, "Token not found.");
  await audit(ctx.app.db, ctx.params.org!, `user:${user.id}`, "scim.token.revoke", { tokenId: ctx.params.id }, ctx.app.config.now());
  sendJson(ctx.res, 200, { ok: true });
}

export function scimRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/orgs/:org/scim", overview).on("POST", "api/orgs/:org/scim/tokens", newToken).on("DELETE", "api/orgs/:org/scim/tokens/:id", revoke);
}
