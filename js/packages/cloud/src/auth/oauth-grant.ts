import { getOAuthProviderApi, verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware, freshSessionMiddleware } from "better-auth/api";
import type { Db } from "../db/db.js";
import { audit } from "../repo/audit.js";
import { createGrant } from "../repo/grants.js";
import { membership } from "../repo/orgs.js";
import { inOrg } from "../repo/trace-join.js";
import { OFFLINE_SCOPE } from "./oauth.js";

const MAX_PROJECTS = 500;

interface GrantBody {
  organizationId?: unknown;
  projectIds?: unknown;
  allProjects?: unknown;
  oauth_query?: unknown;
}

const bad = (message: string) => new APIError("BAD_REQUEST", { message });

/** The app (OAuth client) of a signed query from the consent page. Throws when the signature or its time is off. */
async function clientOf(query: unknown, secret: string): Promise<string> {
  if (typeof query !== "string" || !(await verifyOAuthQueryParams(query, secret))) throw bad("This sign-in link is not valid any more. Connect the app again.");
  const clientId = new URLSearchParams(query).get("client_id");
  if (!clientId) throw bad("This sign-in link names no app.");
  return clientId;
}

/** The projects chosen: every one of `ids` must be in the organization. */
async function projectsOf(db: Db, orgId: string, body: GrantBody): Promise<{ allProjects: boolean; projectIds: string[] }> {
  if (body.allProjects === true) return { allProjects: true, projectIds: [] };
  const ids = Array.isArray(body.projectIds) ? [...new Set(body.projectIds.filter((x): x is string => typeof x === "string"))] : [];
  if (ids.length === 0) throw bad("Pick at least one project, or all of them.");
  if (ids.length > MAX_PROJECTS) throw bad(`Pick at most ${MAX_PROJECTS} projects.`);
  if ((await inOrg(db, orgId, ids)).length !== ids.length) throw bad("A project is not in this organization.");
  return { allProjects: false, projectIds: ids };
}

/** `POST /wizelens/oauth-grant`: the consent page's choice, saved before the consent itself. Needs a sign-in from the last 15 minutes. */
const grantEndpoint = (db: Db) =>
  createAuthEndpoint("/wizelens/oauth-grant", { method: "POST", use: [freshSessionMiddleware] }, async (ctx) => {
    const body = (ctx.body ?? {}) as GrantBody;
    const clientId = await clientOf(body.oauth_query, ctx.context.secret);
    const orgId = typeof body.organizationId === "string" ? body.organizationId : "";
    const { user, session } = ctx.context.session;
    if (!orgId || !(await membership(db, user.id, orgId))) throw new APIError("NOT_FOUND", { message: "Organization not found." });
    const [client] = await db.query<{ name: string | null }>("SELECT name FROM oauth_clients WHERE client_id = $1 AND disabled IS NOT TRUE", [clientId]);
    if (!client) throw bad("This app is not registered any more. Connect it again.");
    const projects = await projectsOf(db, orgId, body);
    const now = Date.now();
    const id = await db.tx(async (q) => {
      const grantId = await createGrant(q, { userId: user.id, orgId, clientId, ...projects }, session.id, now);
      await audit(q, orgId, `user:${user.id}`, "app.connect", { app: client.name ?? clientId, clientId, grantId, ...projects }, now);
      return grantId;
    });
    return ctx.json({ id });
  });

/** `/wizelens/oauth-verify`, server only: the active access token's claims, or null. The MCP route calls it. */
const verifyEndpoint = () =>
  createAuthEndpoint("/wizelens/oauth-verify", { method: "POST", metadata: { SERVER_ONLY: true } }, async (ctx) => {
    const token = (ctx.body as { token?: unknown } | undefined)?.token;
    const opts = ctx.context.getPlugin("oauth-provider")?.options;
    if (typeof token !== "string" || !opts) return ctx.json(null);
    try {
      return ctx.json(await getOAuthProviderApi(ctx, opts).requireActiveAccessToken(token));
    } catch {
      return ctx.json(null);
    }
  });

/** Every authorization asks for refresh tokens too, so an agent on a schedule keeps its access until the person ends it. */
const offlineHook = {
  matcher: (ctx: { path?: string }) => ctx.path === "/oauth2/authorize",
  handler: createAuthMiddleware(async (ctx) => {
    const scope = typeof ctx.query?.scope === "string" ? ctx.query.scope : undefined;
    if (!scope || scope.split(" ").includes(OFFLINE_SCOPE)) return;
    return { context: { query: { ...ctx.query, scope: `${scope} ${OFFLINE_SCOPE}` } } };
  }),
};

/** The cloud's part of OAuth: which organization and projects a connected app reads, and token checks for the MCP route. */
export function grantPlugin(db: Db): BetterAuthPlugin {
  return { id: "wizelens-oauth", endpoints: { wizelensOAuthGrant: grantEndpoint(db), wizelensOAuthVerify: verifyEndpoint() }, hooks: { before: [offlineHook] } } as BetterAuthPlugin;
}
