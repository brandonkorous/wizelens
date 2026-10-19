import type { Ctx } from "../app.js";
import { grantById } from "../repo/grants.js";
import { membership } from "../repo/orgs.js";
import { inOrg, orgProjectIds } from "../repo/trace-join.js";
import { GRANT_CLAIM, MCP_SCOPE, mcpResources } from "./oauth.js";
import type { AppPrincipal } from "./principal.js";
import { can } from "./roles.js";

interface Claims {
  sub?: unknown;
  scope?: unknown;
  aud?: unknown;
  client_id?: unknown;
  [GRANT_CLAIM]?: unknown;
}

/** The token names our MCP (or no resource, from older clients) and has the read scope. */
function fitsMcp(ctx: Ctx, c: Claims): boolean {
  const scopes = typeof c.scope === "string" ? c.scope.split(" ") : [];
  const aud = c.aud === undefined ? [] : Array.isArray(c.aud) ? c.aud : [c.aud];
  const ours = new Set(mcpResources(ctx.app.baseUrl(), ctx.app.config.mcpUrl));
  return scopes.includes(MCP_SCOPE) && aud.every((a) => typeof a === "string" && ours.has(a));
}

/** A connected app's access token: what its grant lets it read now. Undefined when the token, grant, or membership is gone. */
export async function appPrincipalOf(ctx: Ctx, token: string): Promise<{ orgId: string; principal: AppPrincipal } | undefined> {
  const claims = (await ctx.app.auth.api.wizelensOAuthVerify({ body: { token } })) as Claims | null;
  if (!claims || !fitsMcp(ctx, claims) || typeof claims[GRANT_CLAIM] !== "string") return undefined;
  const { db } = ctx.app;
  const grant = await grantById(db, claims[GRANT_CLAIM], ctx.app.config.now());
  if (!grant || grant.userId !== claims.sub || grant.clientId !== claims.client_id) return undefined;
  const m = await membership(db, grant.userId, grant.orgId);
  if (!m || !can(m.role, "read")) return undefined;
  const projectIds = grant.allProjects ? await orgProjectIds(db, grant.orgId) : await inOrg(db, grant.orgId, grant.projectIds);
  const [client] = await db.query<{ name: string | null }>("SELECT name FROM oauth_clients WHERE client_id = $1", [grant.clientId]);
  return { orgId: grant.orgId, principal: { kind: "app", grantId: grant.id, userId: grant.userId, app: client?.name ?? grant.clientId, projectIds } };
}
