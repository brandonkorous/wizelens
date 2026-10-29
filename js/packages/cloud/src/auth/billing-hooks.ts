import { APIError, type createAuthMiddleware } from "better-auth/api";
import { planRequired } from "../billing/gate.js";
import { audit } from "../repo/audit.js";
import { orgHas } from "../repo/billing.js";
import { scimTokenOf } from "../repo/scim-tokens.js";
import type { AuthDeps } from "./deps.js";

type HookCtx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

const SSO_SETUP = new Set(["/sso/register", "/sso/update-provider"]);
/** Plan calls that act for someone; the Stripe redirect back (`/subscription/success`) is not one. */
const PLAN_CALL = /^\/subscription\/(upgrade|cancel|restore|list|billing-portal)$/;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** SSO setup needs a plan with SSO; plan calls must name the organization, since only organizations hold plans. */
export async function billingGuard(deps: AuthDeps, ctx: HookCtx): Promise<void> {
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  if (SSO_SETUP.has(ctx.path)) {
    const orgId = str(body.organizationId) ?? (await providerOrg(ctx, str(body.providerId)));
    if (orgId && !(await orgHas(deps.db, orgId, deps.billingOn, "sso"))) throw new APIError("PAYMENT_REQUIRED", { message: planRequired("sso").message, code: "PLAN_REQUIRED" });
  }
  if (PLAN_CALL.test(ctx.path)) {
    const query = (ctx.query ?? {}) as Record<string, unknown>;
    const type = str(body.customerType) ?? str(query.customerType);
    const ref = str(body.referenceId) ?? str(query.referenceId);
    if (type !== "organization" || !ref) throw new APIError("BAD_REQUEST", { message: "Plans belong to an organization: send customerType organization and its referenceId." });
  }
}

async function providerOrg(ctx: HookCtx, providerId: string | undefined): Promise<string | undefined> {
  if (!providerId) return undefined;
  const row = await ctx.context.adapter.findOne<{ organizationId?: string | null }>({ model: "ssoProvider", where: [{ field: "providerId", value: providerId }] });
  return row?.organizationId ?? undefined;
}

const SCIM_CHANGE = /^\/scim\/v2\/(Users|Groups)(\/[^/]+)?$/;
const VERB: Record<string, string> = { POST: "create", PUT: "update", PATCH: "update", DELETE: "delete" };
/** The id in a SCIM path: `ctx.path` is the route pattern (`/Users/:userId`), so read the route's values. */
const scimId = (ctx: HookCtx): string | undefined => Object.values((ctx.params ?? {}) as Record<string, unknown>).map(str).find(Boolean);

type Named = { userName?: string; displayName?: string };
/** A deleted SCIM user's names, read before the delete runs; keyed by the request. */
const deleting = new WeakMap<Request, Named>();

/** Before a SCIM delete of a person, keep their names: the audit line is written after they are gone. */
export async function rememberScimDelete(deps: AuthDeps, ctx: HookCtx): Promise<void> {
  const m = SCIM_CHANGE.exec(ctx.path);
  const id = scimId(ctx);
  if (ctx.request?.method !== "DELETE" || m?.[1] !== "Users" || !id) return;
  const [row] = await deps.db.query<{ user_name: string; display_name: string }>("SELECT user_name, display_name FROM scim_users WHERE id = $1", [id]);
  if (row) deleting.set(ctx.request, { userName: row.user_name, displayName: row.display_name });
}

/** Each change an identity provider makes through SCIM goes to the organization's audit log, naming the person and whether they were turned off. */
export async function auditScim(deps: AuthDeps, ctx: HookCtx): Promise<void> {
  const verb = VERB[ctx.request?.method ?? ""];
  const m = SCIM_CHANGE.exec(ctx.path);
  if (!verb || !m) return;
  const bearer = ctx.headers?.get("authorization")?.replace(/^bearer\s+/i, "") ?? "";
  const token = await scimTokenOf(deps.db, bearer, Date.now());
  if (!token) return;
  const kind = m[1] === "Users" ? "user" : "group";
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const back = (ctx.context.returned ?? {}) as Record<string, unknown>;
  const gone = ctx.request ? deleting.get(ctx.request) : undefined;
  const userName = str(body.userName) ?? str(back.userName) ?? gone?.userName;
  const displayName = str(body.displayName) ?? str(back.displayName) ?? gone?.displayName;
  const active = verb === "update" && typeof back.active === "boolean" ? back.active : undefined;
  const detail = { resource: kind, id: scimId(ctx) ?? str(back.id), userName, displayName, active, tokenId: token.id };
  await audit(deps.db, token.orgId, `scim:${token.id}`, `scim.${kind}.${verb}`, detail, Date.now());
}
