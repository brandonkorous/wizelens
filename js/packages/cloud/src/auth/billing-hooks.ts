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

/** Each change an identity provider makes through SCIM goes to the organization's audit log. */
export async function auditScim(deps: AuthDeps, ctx: HookCtx): Promise<void> {
  const verb = VERB[ctx.request?.method ?? ""];
  const m = SCIM_CHANGE.exec(ctx.path);
  if (!verb || !m) return;
  const bearer = ctx.headers?.get("authorization")?.replace(/^bearer\s+/i, "") ?? "";
  const token = await scimTokenOf(deps.db, bearer, Date.now());
  if (!token) return;
  const kind = m[1] === "Users" ? "user" : "group";
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const detail = { resource: kind, id: m[2]?.slice(1), userName: str(body.userName), displayName: str(body.displayName), tokenId: token.id };
  await audit(deps.db, token.orgId, `scim:${token.id}`, `scim.${kind}.${verb}`, detail, Date.now());
}
